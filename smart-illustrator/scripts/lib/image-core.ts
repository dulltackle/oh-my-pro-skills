import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import {
  buildProviderRequest,
  extractImageFromGenerateContentResponse,
  extractImageFromOpenAiImagesResponse,
  type ApiBaseUrls,
  type AspectRatio,
  type FetchLike,
  type TuziGenerateContentResponse,
  type OpenAiImagesResponse,
  type Provider,
  type ReferenceImage,
  type Size,
} from "./provider.js";
import {
  SmartIllustratorError,
  asSmartIllustratorError,
  buildHttpError,
} from "./errors.js";

export type { ReferenceImage } from "./provider.js";

export interface GenerationResult {
  imageData: Buffer;
  mimeType: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildNetworkError(provider: Provider, error: unknown): SmartIllustratorError {
  const wrapped = asSmartIllustratorError(error, "network");
  return new SmartIllustratorError({
    kind: "network",
    code: wrapped.code ?? "NETWORK_ERROR",
    message: `${provider} 请求失败：${wrapped.message}`,
    retryable: true,
    cause: error,
  });
}

async function readHttpErrorDetail(response: Response): Promise<string | undefined> {
  const text = (await response.text()).trim();
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const nestedError = parsed.error;
      if (isRecord(nestedError) && typeof nestedError.message === "string") {
        return nestedError.message;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    // Keep original text.
  }

  return text.slice(0, 300);
}

async function fetchProviderJson<T>(options: {
  provider: Provider;
  url: string;
  init: RequestInit;
  fetchImpl: FetchLike;
}): Promise<T> {
  const { provider, url, init, fetchImpl } = options;
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw buildNetworkError(provider, error);
  }

  if (!response.ok) {
    const detail = await readHttpErrorDetail(response);
    throw buildHttpError({
      provider,
      status: response.status,
      statusText: response.statusText,
      detail,
    });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new SmartIllustratorError({
      kind: "provider",
      code: "INVALID_JSON",
      message: `${provider} 返回了无法解析的响应`,
      retryable: true,
      cause: error,
    });
  }
}

export async function loadReferenceImages(
  paths: string[],
  options: {
    ignoreMissing?: boolean;
  } = {},
): Promise<ReferenceImage[]> {
  const { ignoreMissing = false } = options;
  const images: ReferenceImage[] = [];

  for (const imagePath of paths.slice(0, 3)) {
    const absolutePath = isAbsolute(imagePath)
      ? imagePath
      : resolve(process.cwd(), imagePath);

    try {
      const buffer = await readFile(absolutePath);
      const ext = extname(absolutePath).toLowerCase();
      const mimeType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : "image/png";

      images.push({
        mimeType,
        base64: buffer.toString("base64"),
      });

      console.log(
        `Loaded reference image: ${imagePath} (${(buffer.length / 1024).toFixed(1)} KB)`,
      );
    } catch (error) {
      if (ignoreMissing) {
        console.warn(
          `Warning: Ignored unavailable reference image: ${imagePath} (${absolutePath})`,
        );
        continue;
      }

      throw new SmartIllustratorError({
        kind: "input",
        code: "REFERENCE_IMAGE_LOAD_FAILED",
        message:
          `加载参考图失败：${imagePath}（解析路径：${absolutePath}）。` +
          "请检查 --ref 路径是否存在且可读，或显式传入 --ignore-missing-ref 跳过不可用参考图。",
        retryable: false,
        cause: error,
      });
    }
  }

  return images;
}

function extractImageUrlFromTuziResponse(
  data: TuziGenerateContentResponse,
): { url: string; mimeType: string } | null {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  for (const part of parts) {
    if (part.text) {
      const match = part.text.match(/!\[image?\]\(([^)]+)\)/i);
      if (match) {
        const content = match[1];
        if (content.startsWith("data:image/")) {
          const dataMatch = content.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (dataMatch) {
            return { url: content, mimeType: dataMatch[1] };
          }
        } else if (content.startsWith("http")) {
          return { url: content, mimeType: "image/png" };
        }
      }
    }
  }

  return null;
}

async function generateImageTuzi(
  prompt: string,
  model: string,
  apiKey: string,
  size: Size = "default",
  references: ReferenceImage[] = [],
  aspectRatio?: AspectRatio,
  fetchImpl: FetchLike = fetch,
  baseUrls: Partial<ApiBaseUrls> = {},
  signal?: AbortSignal,
): Promise<GenerationResult | null> {
  const req = buildProviderRequest({
    provider: "tuzi",
    prompt,
    model,
    apiKey,
    size,
    references,
    aspectRatio,
    baseUrls,
  });
  const data = await fetchProviderJson<TuziGenerateContentResponse>({
    provider: "tuzi",
    url: req.url,
    init: { ...req.init, signal },
    fetchImpl,
  });
  if (data.error) {
    throw new SmartIllustratorError({
      kind: "provider",
      code: data.error.code ? `TUZI_${data.error.code}` : "TUZI_API_ERROR",
      message: `Tuzi API Error: ${data.error.message} (code: ${data.error.code})`,
      retryable: data.error.code === 429 || data.error.code >= 500,
    });
  }

  const urlResult = extractImageUrlFromTuziResponse(data);
  if (urlResult) {
    if (urlResult.url.startsWith("data:")) {
      const dataMatch = urlResult.url.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (dataMatch) {
        return {
          imageData: Buffer.from(dataMatch[2], "base64"),
          mimeType: dataMatch[1],
        };
      }
    } else {
      let imgResponse: Response;
      try {
        imgResponse = await fetchImpl(urlResult.url, { signal });
      } catch (error) {
        throw buildNetworkError("tuzi", error);
      }
      if (!imgResponse.ok) {
        throw buildHttpError({
          provider: "tuzi",
          status: imgResponse.status,
          statusText: imgResponse.statusText,
          detail: "下载 Tuzi 返回的远程图片失败",
        });
      }
      const arrayBuffer = await imgResponse.arrayBuffer();
      return {
        imageData: Buffer.from(arrayBuffer),
        mimeType: urlResult.mimeType,
      };
    }
  }

  return extractImageFromGenerateContentResponse(data);
}

async function generateImageTuziOpenai(
  prompt: string,
  model: string,
  apiKey: string,
  size: Size = "default",
  references: ReferenceImage[] = [],
  aspectRatio?: AspectRatio,
  fetchImpl: FetchLike = fetch,
  baseUrls: Partial<ApiBaseUrls> = {},
  signal?: AbortSignal,
): Promise<GenerationResult | null> {
  const req = buildProviderRequest({
    provider: "tuzi-openai",
    prompt,
    model,
    apiKey,
    size,
    references,
    aspectRatio,
    baseUrls,
  });
  const data = await fetchProviderJson<OpenAiImagesResponse>({
    provider: "tuzi-openai",
    url: req.url,
    init: { ...req.init, signal },
    fetchImpl,
  });
  if (data.error) {
    const numericCode = Number(data.error.code);
    throw new SmartIllustratorError({
      kind: "provider",
      code: data.error.code
        ? `TUZI_OPENAI_${data.error.code}`
        : "TUZI_OPENAI_API_ERROR",
      message: `Tuzi OpenAI API Error: ${data.error.message} (code: ${data.error.code})`,
      retryable: numericCode === 429 || numericCode >= 500,
    });
  }

  const extracted = extractImageFromOpenAiImagesResponse(data);
  if (!extracted) {
    throw new SmartIllustratorError({
      kind: "provider",
      code: "TUZI_OPENAI_EMPTY_IMAGE",
      message: "Tuzi OpenAI API did not return an image.",
      retryable: true,
    });
  }

  if ("imageData" in extracted) {
    return extracted;
  }

  let imgResponse: Response;
  try {
    imgResponse = await fetchImpl(extracted.imageUrl, { signal });
  } catch (error) {
    throw buildNetworkError("tuzi-openai", error);
  }
  if (!imgResponse.ok) {
    throw buildHttpError({
      provider: "tuzi-openai",
      status: imgResponse.status,
      statusText: imgResponse.statusText,
      detail: "下载 Tuzi OpenAI 返回的远程图片失败",
    });
  }
  const arrayBuffer = await imgResponse.arrayBuffer();
  return {
    imageData: Buffer.from(arrayBuffer),
    mimeType: imgResponse.headers.get("content-type") || extracted.mimeType,
  };
}

export interface RunGenerationOnceOptions {
  provider: Provider;
  prompt: string;
  model: string;
  apiKey: string;
  size?: Size;
  aspectRatio?: AspectRatio;
  references?: ReferenceImage[];
  fetchImpl?: FetchLike;
  baseUrls?: Partial<ApiBaseUrls>;
  signal?: AbortSignal;
}

export async function runGenerationOnce(
  options: RunGenerationOnceOptions,
): Promise<GenerationResult | null> {
  const {
    provider,
    prompt,
    model,
    apiKey,
    size = "default",
    aspectRatio,
    references = [],
    fetchImpl = fetch,
    baseUrls = {},
    signal,
  } = options;

  if (provider === "tuzi") {
    return generateImageTuzi(
      prompt,
      model,
      apiKey,
      size,
      references,
      aspectRatio,
      fetchImpl,
      baseUrls,
      signal,
    );
  }

  if (provider === "tuzi-openai") {
    return generateImageTuziOpenai(
      prompt,
      model,
      apiKey,
      size,
      references,
      aspectRatio,
      fetchImpl,
      baseUrls,
      signal,
    );
  }

  throw new SmartIllustratorError({
    kind: "config",
    code: "UNSUPPORTED_PROVIDER",
    message: `Unsupported provider: ${provider}`,
    retryable: false,
  });
}
