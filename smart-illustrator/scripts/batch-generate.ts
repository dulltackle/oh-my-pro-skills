#!/usr/bin/env node

/**
 * Batch Image Generation Script
 *
 * Generates multiple images from a JSON config file.
 * Supports the unified JSON format (same as web version).
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  parseBatchCliOptions,
  type BatchCliOptions,
} from "./lib/batch-cli-options.js";
import {
  buildPromptFromUnified,
  parseRegenerateIds,
  validateUnifiedConfig,
  type UnifiedConfig,
} from "./lib/batch-config.js";
import { runWithRetry } from "./lib/batch-runner.js";
import {
  buildBatchSummary,
  buildRetryCommand,
  type BatchItemResult,
} from "./lib/batch-summary.js";
import { bootstrapEnv } from "./lib/env.js";
import {
  SmartIllustratorError,
  asSmartIllustratorError,
  formatCliError,
} from "./lib/errors.js";
import { loadReferenceImages, runGenerationOnce } from "./lib/image-core.js";
import {
  getDefaultModel,
  resolveProviderAndKey,
  type AspectRatio,
  type Provider,
} from "./lib/provider.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function printError(
  error: unknown,
  fallbackKind?: Parameters<typeof asSmartIllustratorError>[1],
): void {
  console.error(`Error: ${formatCliError(asSmartIllustratorError(error, fallbackKind))}`);
}

async function readConfig(configPath: string): Promise<UnifiedConfig> {
  try {
    const configContent = await readFile(configPath, "utf-8");
    const parsedConfig = JSON.parse(configContent) as unknown;
    return validateUnifiedConfig(parsedConfig);
  } catch (error) {
    printError(error, "config");
    process.exit(1);
  }
}

async function resolveBatchProvider(
  options: BatchCliOptions,
): Promise<{
  provider: Provider;
  apiKey: string;
  references: Awaited<ReturnType<typeof loadReferenceImages>>;
}> {
  try {
    const references =
      options.refPaths.length > 0
        ? await loadReferenceImages(options.refPaths, {
            ignoreMissing: options.ignoreMissingRef,
          })
        : [];
    const resolved = resolveProviderAndKey({
      provider: options.requestedProvider,
      refPaths: references.length > 0 ? options.refPaths : [],
    });
    return {
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      references,
    };
  } catch (error) {
    printError(error, "provider");
    process.exit(1);
  }
}

async function main() {
  await bootstrapEnv();
  const options = parseBatchCliOptions(process.argv.slice(2));

  if (!options.configPath) {
    throw new SmartIllustratorError({
      kind: "input",
      message: "--config is required",
      retryable: false,
    });
  }

  const config = await readConfig(options.configPath);
  let regenerateIds: Set<number> | null;
  try {
    regenerateIds = parseRegenerateIds(
      options.regenerateValue,
      config.pictures.map((picture) => picture.id),
    );
  } catch (error) {
    printError(error, "input");
    process.exit(1);
  }

  const { provider, apiKey, references } = await resolveBatchProvider(options);
  const model = options.model || getDefaultModel(provider);
  const prefix =
    options.prefix || basename(options.configPath, ".json").replace(/-slides$/, "");

  await mkdir(options.outputDir, { recursive: true });

  const total = config.pictures.length;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  let retried = 0;
  const results: BatchItemResult[] = [];
  const failedItems: BatchItemResult[] = [];
  const resolvedConfigPath = resolve(options.configPath);
  const resolvedOutputDir = resolve(options.outputDir);
  const summaryPath = join(resolvedOutputDir, `${prefix}.summary.json`);
  const aspectRatio =
    options.cliAspectRatio ?? (config.batch_rules?.aspect_ratio as AspectRatio | undefined);

  console.log(`\nBatch Image Generation`);
  console.log(`======================`);
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Size: ${options.size}`);
  if (aspectRatio) {
    console.log(`Aspect ratio: ${aspectRatio}`);
  }
  if (references.length > 0) {
    console.log(`Reference images: ${references.length}`);
  }
  console.log(`Total: ${total} images`);
  console.log(`Prefix: ${prefix}`);
  console.log(`Output: ${options.outputDir}`);
  console.log(`Delay: ${options.delay}ms between requests`);
  console.log(`Timeout: ${options.timeoutMs}ms per image`);
  console.log(`Retries: ${options.maxRetries} (backoff base ${options.backoffBaseMs}ms)`);
  if (options.forceRegenerate) {
    console.log(`Mode: Force regenerate all`);
  } else if (regenerateIds) {
    console.log(`Mode: Regenerate specific IDs: ${[...regenerateIds].join(", ")}`);
  } else {
    console.log(`Mode: Resume (skip existing)`);
  }
  console.log();

  let needsDelay = false;

  for (const picture of config.pictures) {
    const filename = `${prefix}-${String(picture.id).padStart(2, "0")}.png`;
    const outputPath = join(resolvedOutputDir, filename);

    const fileExists = existsSync(outputPath);
    const shouldRegenerate = regenerateIds?.has(picture.id);
    const shouldSkip =
      fileExists && !options.forceRegenerate && !shouldRegenerate;

    if (shouldSkip) {
      console.log(`[${picture.id}/${total}] Skipping: ${filename} (already exists)`);
      skipped++;
      results.push({
        id: picture.id,
        topic: picture.topic,
        filename,
        outputPath,
        status: "skipped",
        retryCount: 0,
      });
      continue;
    }

    if (needsDelay) {
      console.log(`  Waiting ${options.delay}ms...`);
      await sleep(options.delay);
    }

    console.log(`[${picture.id}/${total}] Generating: ${filename}`);
    console.log(`  Topic: ${picture.topic}`);
    if (shouldRegenerate) {
      console.log(`  (Regenerating as requested)`);
    }

    let itemRetryCount = 0;
    try {
      const prompt = buildPromptFromUnified(picture, config.style);
      const { value: result, retryCount } = await runWithRetry(
        async (signal) => {
          const generated = await runGenerationOnce({
            provider,
            prompt,
            model,
            apiKey,
            size: options.size,
            references,
            aspectRatio,
            signal,
          });
          if (!generated) {
            throw new SmartIllustratorError({
              kind: "provider",
              code: "NO_IMAGE_GENERATED",
              message: "No image generated",
              retryable: true,
            });
          }
          return generated;
        },
        {
          maxRetries: options.maxRetries,
          timeoutMs: options.timeoutMs,
          backoffBaseMs: options.backoffBaseMs,
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

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, result.imageData);
      if (retryCount > 0) {
        console.log(`  ↻ Retried ${retryCount} time(s)`);
      }
      console.log(`  ✓ Saved (${(result.imageData.length / 1024).toFixed(1)} KB)`);
      success++;
      retried += retryCount;
      results.push({
        id: picture.id,
        topic: picture.topic,
        filename,
        outputPath,
        status: "generated",
        retryCount,
      });
      needsDelay = true;
    } catch (error) {
      retried += itemRetryCount;
      const appError = asSmartIllustratorError(error, "provider");
      const itemResult: BatchItemResult = {
        id: picture.id,
        topic: picture.topic,
        filename,
        outputPath,
        status: "failed",
        retryCount: itemRetryCount,
        errorType: appError.kind,
        error: appError.message,
      };
      console.log(`  ✗ Error: ${formatCliError(appError)}`);
      failed++;
      results.push(itemResult);
      failedItems.push(itemResult);
      needsDelay = true;
    }
  }

  const summary = buildBatchSummary({
    configPath: resolvedConfigPath,
    outputDir: resolvedOutputDir,
    summaryPath,
    provider,
    model,
    size: options.size,
    aspectRatio,
    refPaths: options.refPaths,
    referenceCount: references.length,
    prefix,
    total,
    generated: success,
    skipped,
    failed,
    retried,
    items: results,
  });

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");

  console.log(`\n======================`);
  if (skipped > 0) {
    console.log(`Complete: ${success} generated, ${skipped} skipped, ${failed} failed`);
  } else {
    console.log(`Complete: ${success}/${total} succeeded, ${failed} failed`);
  }
  if (retried > 0) {
    console.log(`Retry attempts used: ${retried}`);
  }
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Summary file: ${summaryPath}`);

  if (failedItems.length > 0) {
    console.log(`Failed items:`);
    for (const item of failedItems) {
      console.log(`  - [${item.id}] ${item.topic}: ${item.error}`);
    }
    console.log(`Retry command:`);
    console.log(
      `  ${buildRetryCommand(
        options.configPath,
        options.outputDir,
        provider,
        options.size,
        aspectRatio,
        options.refPaths,
        options.ignoreMissingRef,
        options.delay,
        options.timeoutMs,
        options.maxRetries,
        options.backoffBaseMs,
        failedItems.map((item) => item.id),
      )}`,
    );
  }
}

main().catch((error) => {
  console.error(`Error: ${formatCliError(asSmartIllustratorError(error))}`);
  process.exit(1);
});
