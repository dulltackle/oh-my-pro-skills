import { getApiBaseUrls } from "./env.js";
import type { ApiBaseUrls } from "./env.js";
import type { AspectRatio, Provider, Size } from "./cli-types.js";
import { SmartIllustratorError } from "./errors.js";

export type { ApiBaseUrls } from "./env.js";
export type { AspectRatio, Provider, Size } from "./cli-types.js";
export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export const DEFAULT_TUZI_MODEL = "nano-banana-2";
export const DEFAULT_TUZI_OPENAI_MODEL = "gpt-image-2";
export interface TuziGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
}

export interface OpenAiImagesResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  output_format?: string;
  error?: {
    message: string;
    code?: number | string;
  };
}

export interface ReferenceImage {
  mimeType: string;
  base64: string;
}

export interface ProviderRequestOptions {
  provider: Provider;
  prompt: string;
  model: string;
  apiKey: string;
  size?: Size;
  references?: ReferenceImage[];
  aspectRatio?: AspectRatio;
  baseUrls?: Partial<ApiBaseUrls>;
}

export interface BuiltProviderRequest {
  provider: Provider;
  url: string;
  init: RequestInit;
}

export function getDefaultModel(provider: Provider): string {
  if (provider === "tuzi") return DEFAULT_TUZI_MODEL;
  if (provider === "tuzi-openai") return DEFAULT_TUZI_OPENAI_MODEL;
  throw new SmartIllustratorError({
    kind: "config",
    code: "UNSUPPORTED_PROVIDER",
    message: `Unsupported provider: ${provider}`,
    retryable: false,
  });
}

function getOpenAiImageSize(aspectRatio?: AspectRatio): string {
  if (!aspectRatio) return "auto";

  const [width, height] = aspectRatio.split(":").map(Number);
  if (width === height) return "1024x1024";
  if (width > height) return "1536x1024";
  return "1024x1536";
}

function mimeTypeFromOutputFormat(outputFormat?: string): string {
  if (outputFormat === "jpeg" || outputFormat === "jpg") return "image/jpeg";
  if (outputFormat === "webp") return "image/webp";
  return "image/png";
}

export function buildProviderRequest(
  options: ProviderRequestOptions,
): BuiltProviderRequest {
  const {
    provider,
    prompt,
    model,
    apiKey,
    size = "default",
    references = [],
    aspectRatio,
    baseUrls = {},
  } = options;
  const resolvedBaseUrls = getApiBaseUrls(baseUrls);

  if (provider === "tuzi-openai") {
    const openAiSize = getOpenAiImageSize(aspectRatio);
    const endpoint = references.length > 0 ? "edits" : "generations";
    const url = `${resolvedBaseUrls.tuziOpenai}/images/${endpoint}`;

    if (references.length > 0) {
      const body = new FormData();
      body.append("model", model);
      body.append("prompt", prompt);
      body.append("n", "1");
      body.append("size", openAiSize);
      for (const [index, ref] of references.entries()) {
        const extension = ref.mimeType.split("/")[1] || "png";
        body.append(
          "image[]",
          new Blob([Buffer.from(ref.base64, "base64")], {
            type: ref.mimeType,
          }),
          `reference-${index + 1}.${extension}`,
        );
      }

      return {
        provider,
        url,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        },
      };
    }

    return {
      provider,
      url,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: openAiSize,
        }),
      },
    };
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
  };
  const imageConfig: Record<string, string> = {};
  if (size === "2k") imageConfig.imageSize = "2K";
  if (size === "4k") imageConfig.imageSize = "4K";
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }

  const parts: Array<Record<string, unknown>> = [];
  if (references.length > 0) {
    parts.push({
      text: "以下图片是风格参考。请匹配它们的视觉风格、色彩搭配和艺术手法：",
    });
    for (const ref of references) {
      if (provider === "tuzi") {
        parts.push({
          inline_data: {
            mime_type: ref.mimeType,
            data: ref.base64,
          },
        });
      } else {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.base64,
          },
        });
      }
    }
    parts.push({ text: "---\n请按照上述风格生成新图片：" });
  }
  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig,
  };

  return {
    provider,
    url: `${resolvedBaseUrls.tuzi}/${model}:generateContent`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    },
  };
}

export function extractImageFromGenerateContentResponse(
  data: TuziGenerateContentResponse,
): { imageData: Buffer; mimeType: string } | null {
  if (!data.candidates?.[0]?.content?.parts) {
    throw new SmartIllustratorError({
      kind: "provider",
      code: "PROVIDER_EMPTY_CONTENT",
      message: "Provider response did not include image content",
      retryable: true,
    });
  }

  for (const part of data.candidates[0].content.parts) {
    if (part.inlineData?.data) {
      return {
        imageData: Buffer.from(part.inlineData.data, "base64"),
        mimeType: part.inlineData.mimeType || "image/png",
      };
    }
    if (part.inline_data?.data) {
      return {
        imageData: Buffer.from(part.inline_data.data, "base64"),
        mimeType: part.inline_data.mime_type || "image/png",
      };
    }
  }

  return null;
}

export function extractImageFromOpenAiImagesResponse(
  data: OpenAiImagesResponse,
): { imageData: Buffer; mimeType: string } | { imageUrl: string; mimeType: string } | null {
  const image = data.data?.[0];
  if (!image) return null;

  const mimeType = mimeTypeFromOutputFormat(data.output_format);
  if (image.b64_json) {
    return {
      imageData: Buffer.from(image.b64_json, "base64"),
      mimeType,
    };
  }
  if (image.url) {
    return {
      imageUrl: image.url,
      mimeType,
    };
  }

  return null;
}

export interface ProviderKeys {
  tuzi?: string;
}

export interface ResolveProviderInput {
  provider?: Provider | null;
  refPaths?: string[];
  keys?: ProviderKeys;
}

export interface ResolvedProvider {
  provider: Provider;
  apiKey: string;
}

export function resolveProviderAndKey(
  input: ResolveProviderInput,
): ResolvedProvider {
  const tuziKey = input.keys?.tuzi ?? process.env.TUZI_API_KEY;

  let provider = input.provider || null;
  if (!provider) {
    if (tuziKey) {
      provider = "tuzi-openai";
    } else {
      throw new SmartIllustratorError({
        kind: "config",
        code: "API_KEY_MISSING",
        message:
          "No API key found. Set TUZI_API_KEY environment variable",
        retryable: false,
      });
    }
  }

  if (!tuziKey) {
    throw new SmartIllustratorError({
      kind: "config",
      code: "API_KEY_MISSING",
      message: `TUZI_API_KEY is required for ${provider} provider`,
      retryable: false,
    });
  }

  return { provider, apiKey: tuziKey };
}
