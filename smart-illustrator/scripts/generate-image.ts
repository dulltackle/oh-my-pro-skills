#!/usr/bin/env node

/**
 * Image Generation Script (Gemini / Tuzi API / Tuzi OpenAI API)
 *
 * Usage:
 *   node --import tsx ~/.claude/skills/smart-illustrator/scripts/generate-image.ts --prompt "A cute cat" --output cat.png
 *   node --import tsx ~/.claude/skills/smart-illustrator/scripts/generate-image.ts --prompt-file prompt.md --output image.png
 *
 * Style-lock (reference images):
 *   node --import tsx generate-image.ts --prompt "..." --ref style-ref.png --output image.png
 *
 * Environment:
 *   TUZI_API_KEY - Tuzi API key (Google-compatible and OpenAI-compatible endpoints)
 *   TUZI_OPENAI_API_BASE - Optional Tuzi OpenAI-compatible API base
 *   GEMINI_API_KEY - Direct Gemini API key
 *
 * Models:
 *   nano-banana-2 (default for Tuzi)
 *   gpt-image-2 (default for Tuzi OpenAI)
 *   gemini-3-pro-image-preview (default for direct Gemini)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, saveConfig, mergeConfig, type Config } from "./config.js";
import {
  ASPECT_RATIOS,
  PROVIDERS,
  SIZES,
} from "./lib/cli-metadata.js";
import { parseCliArgs, type CliOptionSpec } from "./lib/cli-args.js";
import { runWithRetry } from "./lib/batch-runner.js";
import { bootstrapEnv } from "./lib/env.js";
import {
  SmartIllustratorError,
  asSmartIllustratorError,
  formatCliError,
} from "./lib/errors.js";
import { loadReferenceImages, runGenerationOnce } from "./lib/image-core.js";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_TUZI_MODEL,
  DEFAULT_TUZI_OPENAI_MODEL,
  getDefaultModel,
  resolveProviderAndKey,
  type AspectRatio,
  type Provider,
  type Size,
} from "./lib/provider.js";

const VARIED_REMOVED_MESSAGE =
  "--varied has been removed. Use --candidates 2 to generate multiple candidates and pick one manually.";
const REF_WEIGHT_REMOVED_MESSAGE =
  "--ref-weight 已移除；当前参考图权重不支持配置，请通过 prompt 或参考图选择控制风格强度。";

const GENERATE_CLI_SPECS: CliOptionSpec[] = [
  { name: "help", aliases: ["-h"], type: "boolean" },
  { name: "prompt", aliases: ["-p"], type: "string" },
  { name: "prompt-file", aliases: ["-f"], type: "string" },
  { name: "output", aliases: ["-o"], type: "string" },
  { name: "model", aliases: ["-m"], type: "string" },
  { name: "provider", type: "string", choices: PROVIDERS },
  { name: "size", type: "string", choices: SIZES },
  { name: "aspect-ratio", aliases: ["-a"], type: "string", choices: ASPECT_RATIOS },
  { name: "ref", aliases: ["-r", "--reference"], type: "string", repeatable: true },
  { name: "ignore-missing-ref", type: "boolean" },
  { name: "candidates", aliases: ["-c"], type: "integer", min: 1, max: 4 },
  { name: "timeout", type: "integer", min: 1000, defaultValue: 45_000 },
  { name: "max-retries", type: "integer", min: 0, max: 2, defaultValue: 1 },
  { name: "backoff-base", type: "integer", min: 100, defaultValue: 1_200 },
  { name: "save-config", type: "boolean" },
  { name: "save-config-global", type: "boolean" },
  { name: "no-config", type: "boolean" },
  { name: "varied", type: "boolean", removedMessage: VARIED_REMOVED_MESSAGE },
  { name: "ref-weight", type: "string", removedMessage: REF_WEIGHT_REMOVED_MESSAGE },
];

export { bootstrapEnv } from "./lib/env.js";
export {
  loadReferenceImages,
  runGenerationOnce,
  type GenerationResult,
  type ReferenceImage,
  type RunGenerationOnceOptions,
} from "./lib/image-core.js";
export {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_TUZI_MODEL,
  DEFAULT_TUZI_OPENAI_MODEL,
  buildProviderRequest,
  extractImageFromGeminiLikeResponse,
  extractImageFromOpenAiImagesResponse,
  getDefaultModel,
  resolveProviderAndKey,
  type ApiBaseUrls,
  type AspectRatio,
  type BuiltProviderRequest,
  type FetchLike,
  type GeminiResponse,
  type OpenAiImagesResponse,
  type Provider,
  type ProviderRequestOptions,
  type ResolvedProvider,
  type Size,
} from "./lib/provider.js";

function printUsage(): never {
  console.log(`
Image Generation Script (Gemini / Tuzi API / Tuzi OpenAI API)

Usage:
  node --import tsx generate-image.ts --prompt "description" --output image.png
  node --import tsx generate-image.ts --prompt-file prompt.md --output image.png

Options:
  -p, --prompt <text>       Image description
  -f, --prompt-file <path>  Read prompt from file
  -o, --output <path>       Output image path (default: generated.png)
  -m, --model <model>       Model to use
  --provider <provider>     API provider: tuzi (default), tuzi-openai, or gemini
  --size <size>             Image size: 2k (2048px, default) or default (~1.4K)
  -a, --aspect-ratio <ratio>  Aspect ratio: 1:1, 3:4, 4:3, 9:16, 16:9, 21:9, etc.
  --timeout <ms>            Per-image timeout in ms (default: 45000)
  --max-retries <n>         Retry transient failures (0-2, default: 1)
  --backoff-base <ms>       Retry backoff base delay in ms (default: 1200)
  -h, --help                Show this help

Style-lock Options (reference images):
  -r, --ref <path>          Reference image for style (can use multiple, max 3)
  --ignore-missing-ref      Skip unreadable --ref paths instead of failing

Multi-candidate Options:
  -c, --candidates <n>      Generate multiple candidates (default: 1, max: 4)
                            Output files: output-1.png, output-2.png, etc.

Style Configuration (persistent settings):
  --save-config             Save current settings to project config (.smart-illustrator/config.json)
  --save-config-global      Save current settings to user config (~/.smart-illustrator/config.json)
  --no-config               Ignore config files, use only command-line arguments

Environment Variables (in order of priority):
  TUZI_API_KEY              Tuzi API key (Google-compatible and OpenAI-compatible endpoints)
  TUZI_OPENAI_API_BASE      Tuzi OpenAI-compatible API base (default: https://api.tu-zi.com/v1)
  GEMINI_API_KEY            Direct Gemini API key

Models:
  Tuzi:       ${DEFAULT_TUZI_MODEL} (default)
  Tuzi OpenAI: ${DEFAULT_TUZI_OPENAI_MODEL} (default)
  Gemini:     ${DEFAULT_GEMINI_MODEL} (default)

Examples:
  # Using Tuzi API (default)
  TUZI_API_KEY=xxx node --import tsx generate-image.ts -p "A futuristic city" -o city.png

  # Using direct Gemini API
  GEMINI_API_KEY=xxx node --import tsx generate-image.ts -p "A cute cat" -o cat.png --provider gemini

  # Using Tuzi OpenAI-compatible Images API
  TUZI_API_KEY=xxx node --import tsx generate-image.ts -p "A cute rabbit racing" -o rabbit.png --provider tuzi-openai

  # From prompt file
  node --import tsx generate-image.ts -f illustration-prompt.md -o illustration.png

  # With style reference (style-lock)
  GEMINI_API_KEY=xxx node --import tsx generate-image.ts -p "A tech diagram" -r style-ref.png -o output.png

  # Generate 2 candidates for quality selection
  node --import tsx generate-image.ts -p "A tech diagram" -c 2 -o output.png
`);
  process.exit(0);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

export async function main() {
  await bootstrapEnv();
  const parsed = parseCliArgs(process.argv.slice(2), GENERATE_CLI_SPECS, {
    allowPositionals: false,
  });
  if (parsed.values.help) {
    printUsage();
  }

  let prompt: string | null = (parsed.values.prompt as string | undefined) ?? null;
  const promptFile = (parsed.values["prompt-file"] as string | undefined) ?? null;
  let output: string | null = (parsed.values.output as string | undefined) ?? null;
  let model: string | null = (parsed.values.model as string | undefined) ?? null;
  let provider: Provider | null =
    (parsed.values.provider as Provider | undefined) ?? null;
  let size = parsed.values.size as Size | undefined;
  let aspectRatio = parsed.values["aspect-ratio"] as AspectRatio | undefined;
  const refPaths = stringArray(parsed.values.ref);
  const ignoreMissingRef = parsed.values["ignore-missing-ref"] === true;
  let candidates = parsed.values.candidates as number | undefined;
  const timeoutMs = parsed.values.timeout as number;
  const maxRetries = parsed.values["max-retries"] as number;
  const backoffBaseMs = parsed.values["backoff-base"] as number;
  const shouldSaveConfig =
    parsed.values["save-config"] === true ||
    parsed.values["save-config-global"] === true;
  const saveConfigGlobal = parsed.values["save-config-global"] === true;
  const noConfig = parsed.values["no-config"] === true;

  let loadedConfig: Config = {};
  if (!noConfig) {
    try {
      loadedConfig = loadConfig(process.cwd());
    } catch (error) {
      console.warn(
        `Warning: ${formatCliError(asSmartIllustratorError(error, "config"))}`,
      );
    }
  }

  const finalConfig = mergeConfig(loadedConfig, {
    provider: provider ?? undefined,
    model: model ?? undefined,
    size,
    aspectRatio,
    references: refPaths.length > 0 ? refPaths : undefined,
    candidates,
  });

  provider = finalConfig.provider ?? provider;
  model = finalConfig.model ?? model;
  size = finalConfig.size ?? "2k";
  aspectRatio = finalConfig.aspectRatio ?? aspectRatio;
  candidates = finalConfig.candidates ?? 1;

  if (
    finalConfig.references &&
    finalConfig.references.length > 0 &&
    refPaths.length === 0
  ) {
    refPaths.push(...finalConfig.references);
    console.log(
      `Using ${finalConfig.references.length} reference image(s) from config`,
    );
  }

  if (!output) {
    const baseOutputDir = finalConfig.outputDir
      ? resolve(finalConfig.outputDir)
      : process.cwd();
    output = join(baseOutputDir, "generated.png");
  } else {
    output = resolve(output);
  }

  if (promptFile) {
    prompt = await readFile(promptFile, "utf-8");
  }

  if (!prompt) {
    console.error(
      `Error: ${formatCliError(new SmartIllustratorError({
        kind: "input",
        message: "--prompt or --prompt-file is required",
        retryable: false,
      }))}`,
    );
    process.exit(1);
  }

  try {
    const references =
      refPaths.length > 0
        ? await loadReferenceImages(refPaths, { ignoreMissing: ignoreMissingRef })
        : [];
    const resolved = resolveProviderAndKey({
      provider,
      refPaths: references.length > 0 ? refPaths : [],
    });
    provider = resolved.provider;
    const apiKey = resolved.apiKey;

    if (!model) {
      model = getDefaultModel(provider);
    }
    const effectiveProvider = provider;
    const effectiveModel = model;
    const effectiveApiKey = apiKey;

    console.log(`Provider: ${effectiveProvider}`);
    console.log(`Model: ${effectiveModel}`);
    console.log(`Size: ${size}`);
    if (aspectRatio) {
      console.log(`Aspect ratio: ${aspectRatio}`);
    }
    if (references.length > 0) {
      console.log(`Reference images: ${references.length}`);
    }
    if (candidates > 1) {
      console.log(`Candidates: ${candidates}`);
    }
    console.log(
      `Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}`,
    );

    await mkdir(dirname(output), { recursive: true });

    const generatedFiles: string[] = [];
    const ext = extname(output);
    const baseName = output.slice(0, -ext.length);

    for (let i = 1; i <= candidates; i++) {
      const candidateOutput =
        candidates > 1 ? `${baseName}-${i}${ext}` : output;

      console.log(
        candidates > 1
          ? `\nGenerating candidate ${i}/${candidates}...`
          : "\nGenerating image...",
      );

      let itemRetryCount = 0;
      const { value: result, retryCount } = await runWithRetry(
        async (signal) => {
          const generated = await runGenerationOnce({
            provider: effectiveProvider,
            prompt,
            model: effectiveModel,
            apiKey: effectiveApiKey,
            size,
            references,
            aspectRatio,
            signal,
          });

          if (!generated) {
            throw new SmartIllustratorError({
              kind: "provider",
              code: "NO_IMAGE_GENERATED",
              message: `No image generated for candidate ${i}`,
              retryable: true,
            });
          }

          return generated;
        },
        {
          maxRetries,
          timeoutMs,
          backoffBaseMs,
        },
        {
          onRetry: ({ attempt, maxAttempts, nextDelayMs, error }) => {
            itemRetryCount += 1;
            console.log(
              `  ↻ Retry ${attempt}/${maxAttempts - 1}: ${formatCliError(error)}; waiting ${nextDelayMs}ms`,
            );
          },
        },
      );

      if (retryCount > 0 || itemRetryCount > 0) {
        console.log(`  ↻ Retried ${retryCount} time(s)`);
      }

      await writeFile(candidateOutput, result.imageData);
      generatedFiles.push(candidateOutput);

      console.log(
        `✓ Saved: ${candidateOutput} (${(result.imageData.length / 1024).toFixed(1)} KB)`,
      );
    }

    if (generatedFiles.length === 0) {
      console.error(
        `Error: ${formatCliError(new SmartIllustratorError({
          kind: "provider",
          code: "EMPTY_RESULT",
          message: "No images were generated",
          retryable: true,
        }))}`,
      );
      process.exit(1);
    }

    if (candidates > 1) {
      console.log(`\n=== ${generatedFiles.length} candidates generated ===`);
      generatedFiles.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
      console.log("\nReview the candidates and select the best one.");
    }

    if (shouldSaveConfig && generatedFiles.length > 0) {
      const configToSave: Config = {
        provider: effectiveProvider,
        model: effectiveModel,
        size,
        aspectRatio,
        references: refPaths.length > 0 ? refPaths : undefined,
        candidates,
      };

      saveConfig(configToSave, {
        global: saveConfigGlobal,
        cwd: process.cwd(),
      });

      console.log(
        `\n✓ Config saved to ${saveConfigGlobal ? "user" : "project"} config`,
      );
    }
  } catch (error) {
    console.error(`Error: ${formatCliError(asSmartIllustratorError(error))}`);
    process.exit(1);
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(`Error: ${formatCliError(asSmartIllustratorError(error))}`);
    process.exit(1);
  });
}
