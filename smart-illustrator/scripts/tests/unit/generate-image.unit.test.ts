import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  SmartIllustratorError,
  asSmartIllustratorError,
} from "../../lib/errors.js";
import {
  buildProviderRequest,
  extractImageFromGenerateContentResponse,
  extractImageFromOpenAiImagesResponse,
  resolveProviderAndKey,
  type ProviderRequestOptions,
} from "../../lib/provider.js";
import { loadReferenceImages, runGenerationOnce } from "../../lib/image-core.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x1x8AAAAASUVORK5CYII=";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function bodyOf(req: ReturnType<typeof buildProviderRequest>): Record<string, unknown> {
  return JSON.parse(String(req.init.body));
}

describe("buildProviderRequest", () => {
  const base: Omit<ProviderRequestOptions, "provider"> = {
    prompt: "hello world",
    model: "test-model",
    apiKey: "key-1",
    size: "2k",
    aspectRatio: "16:9",
    baseUrls: {
      tuzi: "https://tz.example",
      tuziOpenai: "https://tz-openai.example",
    },
  };

  it("builds Tuzi request with bearer and inline_data references", () => {
    const req = buildProviderRequest({
      ...base,
      provider: "tuzi",
      references: [{ mimeType: "image/png", base64: "abc" }],
    });
    expect(req.url).toBe("https://tz.example/test-model:generateContent");
    expect((req.init.headers as Record<string, string>).Authorization).toBe("Bearer key-1");
    const body = bodyOf(req) as {
      contents: Array<{ parts: Array<{ inline_data?: { mime_type: string; data: string } }> }>;
    };
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: "image/png",
      data: "abc",
    });
  });

  it("builds Tuzi OpenAI generations request with bearer and mapped size", () => {
    const req = buildProviderRequest({ ...base, provider: "tuzi-openai" });
    expect(req.url).toBe("https://tz-openai.example/images/generations");
    expect((req.init.headers as Record<string, string>).Authorization).toBe("Bearer key-1");
    expect((req.init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    const body = bodyOf(req) as {
      model: string;
      prompt: string;
      n: number;
      size: string;
    };
    expect(body).toEqual({
      model: "test-model",
      prompt: "hello world",
      n: 1,
      size: "1536x1024",
    });
  });

  it("builds Tuzi OpenAI edits request with multipart references", () => {
    const req = buildProviderRequest({
      ...base,
      provider: "tuzi-openai",
      aspectRatio: "3:4",
      references: [{ mimeType: "image/png", base64: PNG_BASE64 }],
    });
    expect(req.url).toBe("https://tz-openai.example/images/edits");
    expect((req.init.headers as Record<string, string>).Authorization).toBe("Bearer key-1");
    expect((req.init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    const body = req.init.body as FormData;
    expect(body.get("model")).toBe("test-model");
    expect(body.get("prompt")).toBe("hello world");
    expect(body.get("n")).toBe("1");
    expect(body.get("size")).toBe("1024x1536");
    expect(body.getAll("image[]")).toHaveLength(1);
  });
});

describe("response extractors", () => {
  it("extracts generateContent inlineData", () => {
    const result = extractImageFromGenerateContentResponse({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: "image/png", data: PNG_BASE64 } }],
          },
        },
      ],
    });
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.length).toBeGreaterThan(0);
  });

  it("extracts tuzi inline_data", () => {
    const result = extractImageFromGenerateContentResponse({
      candidates: [
        {
          content: {
            parts: [{ inline_data: { mime_type: "image/png", data: PNG_BASE64 } }],
          },
        },
      ],
    });
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.length).toBeGreaterThan(0);
  });

  it("throws a typed provider error when generateContent content is missing", () => {
    expect(() => extractImageFromGenerateContentResponse({})).toThrow(
      SmartIllustratorError,
    );

    try {
      extractImageFromGenerateContentResponse({});
    } catch (error) {
      const appError = asSmartIllustratorError(error);
      expect(appError.kind).toBe("provider");
      expect(appError.code).toBe("PROVIDER_EMPTY_CONTENT");
      expect(appError.retryable).toBe(true);
    }
  });

  it("extracts OpenAI Images b64_json", () => {
    const result = extractImageFromOpenAiImagesResponse({
      output_format: "png",
      data: [{ b64_json: PNG_BASE64 }],
    });
    expect(result && "imageData" in result ? result.mimeType : null).toBe("image/png");
    expect(result && "imageData" in result ? result.imageData.length : 0).toBeGreaterThan(0);
  });

  it("extracts OpenAI Images URL", () => {
    const result = extractImageFromOpenAiImagesResponse({
      data: [{ url: "https://cdn.example.com/result.webp" }],
      output_format: "webp",
    });
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/result.webp",
      mimeType: "image/webp",
    });
  });
});

describe("resolveProviderAndKey", () => {
  it("defaults to tuzi-openai when TUZI_API_KEY is present", () => {
    const result = resolveProviderAndKey({
      keys: {
        tuzi: "tz",
      },
    });
    expect(result.provider).toBe("tuzi-openai");
    expect(result.apiKey).toBe("tz");
  });

  it("throws readable error when explicit provider key missing", () => {
    try {
      resolveProviderAndKey({
        provider: "tuzi",
        keys: {},
      });
      throw new Error("Expected resolveProviderAndKey to fail");
    } catch (error) {
      const appError = asSmartIllustratorError(error);
      expect(appError.kind).toBe("config");
      expect(appError.code).toBe("API_KEY_MISSING");
      expect(appError.retryable).toBe(false);
      expect(appError.message).toContain("TUZI_API_KEY is required");
    }
  });

  it("uses TUZI_API_KEY for explicit tuzi-openai provider", () => {
    const result = resolveProviderAndKey({
      provider: "tuzi-openai",
      keys: { tuzi: "tz" },
    });
    expect(result.provider).toBe("tuzi-openai");
    expect(result.apiKey).toBe("tz");
  });

  it("throws readable error when explicit tuzi-openai key is missing", () => {
    try {
      resolveProviderAndKey({
        provider: "tuzi-openai",
        keys: {},
      });
      throw new Error("Expected resolveProviderAndKey to fail");
    } catch (error) {
      const appError = asSmartIllustratorError(error);
      expect(appError.kind).toBe("config");
      expect(appError.code).toBe("API_KEY_MISSING");
      expect(appError.retryable).toBe(false);
      expect(appError.message).toContain("TUZI_API_KEY is required");
    }
  });

  it("throws typed config error when no provider keys are available", () => {
    try {
      resolveProviderAndKey({ keys: {} });
      throw new Error("Expected resolveProviderAndKey to fail");
    } catch (error) {
      const appError = asSmartIllustratorError(error);
      expect(appError.kind).toBe("config");
      expect(appError.code).toBe("API_KEY_MISSING");
      expect(appError.message).toContain("No API key found");
    }
  });
});

describe("runGenerationOnce", () => {
  it("runs through the shared tuzi path", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const result = await runGenerationOnce({
      provider: "tuzi",
      prompt: "hello world",
      model: "test-model",
      apiKey: "key-1",
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inline_data: {
                        mime_type: "image/png",
                        data: PNG_BASE64,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    expect(String(calls[0].input)).toContain(":generateContent");
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.length).toBeGreaterThan(0);
  });

  it("downloads remote image when tuzi returns a markdown image URL", async () => {
    const calls: string[] = [];
    const result = await runGenerationOnce({
      provider: "tuzi",
      prompt: "hello world",
      model: "test-model",
      apiKey: "key-1",
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith("https://cdn.example.com")) {
          return new Response(Buffer.from("mock-png"), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: "![image](https://cdn.example.com/result.png)",
                    },
                  ],
                },
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    expect(calls[0]).toContain(":generateContent");
    expect(calls[1]).toBe("https://cdn.example.com/result.png");
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.toString()).toBe("mock-png");
  });

  it("runs through the tuzi-openai generations path", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const result = await runGenerationOnce({
      provider: "tuzi-openai",
      prompt: "hello world",
      model: "test-model",
      apiKey: "key-1",
      aspectRatio: "1:1",
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            data: [{ b64_json: PNG_BASE64 }],
            output_format: "png",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    expect(String(calls[0].input)).toContain("/images/generations");
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.length).toBeGreaterThan(0);
  });

  it("downloads remote image when tuzi-openai returns a URL", async () => {
    const calls: string[] = [];
    const result = await runGenerationOnce({
      provider: "tuzi-openai",
      prompt: "hello world",
      model: "test-model",
      apiKey: "key-1",
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith("https://cdn.example.com")) {
          return new Response(Buffer.from("mock-png"), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }

        return new Response(
          JSON.stringify({
            data: [{ url: "https://cdn.example.com/openai-result.png" }],
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    expect(calls[0]).toContain("/images/generations");
    expect(calls[1]).toBe("https://cdn.example.com/openai-result.png");
    expect(result?.mimeType).toBe("image/png");
    expect(result?.imageData.toString()).toBe("mock-png");
  });
});

describe("loadReferenceImages", () => {
  it("fails by default when a reference path cannot be read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "smart-illustrator-ref-"));
    tempDirs.push(dir);
    const missingPath = join(dir, "missing.png");

    await expect(loadReferenceImages([missingPath])).rejects.toThrow(missingPath);
    await expect(loadReferenceImages([missingPath])).rejects.toThrow(
      /--ignore-missing-ref/,
    );
  });

  it("can ignore missing references explicitly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "smart-illustrator-ref-"));
    tempDirs.push(dir);
    const validPath = join(dir, "valid.png");
    const missingPath = join(dir, "missing.png");
    await writeFile(validPath, Buffer.from(PNG_BASE64, "base64"));

    await expect(
      loadReferenceImages([validPath, missingPath], { ignoreMissing: true }),
    ).resolves.toHaveLength(1);
  });
});
