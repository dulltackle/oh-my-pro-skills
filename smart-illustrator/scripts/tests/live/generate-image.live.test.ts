import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bootstrapEnv,
  DEFAULT_TUZI_MODEL,
  runGenerationOnce,
  type Provider,
} from "../../generate-image.js";

await bootstrapEnv();

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function assertLiveGeneration(provider: Provider, model: string, key: string) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputDir = join(__dirname, "outputs", provider);
  await mkdir(outputDir, { recursive: true });
  const outputFile = join(outputDir, `${provider}.png`);

  const result = await withRetry(
    () =>
      runGenerationOnce({
        provider,
        model,
        apiKey: key,
        prompt: "Minimal flat icon of a rocket, simple background, clean style.",
        size: "default",
        aspectRatio: "1:1",
      }),
    1,
  );

  expect(result).toBeTruthy();
  expect(result?.mimeType).toMatch(/^image\//);
  expect(result?.imageData.length || 0).toBeGreaterThan(0);
  await writeFile(outputFile, result!.imageData);
  expect(existsSync(outputFile)).toBe(true);
}

describe("live API smoke tests", () => {
  if (process.env.TUZI_API_KEY) {
    it(
      "Tuzi generates image",
      async () => {
        await assertLiveGeneration("tuzi", DEFAULT_TUZI_MODEL, process.env.TUZI_API_KEY!);
      },
      600_000,
    );
  } else {
    it.skip("Tuzi generates image (requires TUZI_API_KEY)", () => {});
  }


});
