import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { runWithRetry } from "./batch-runner.js";
import {
  SmartIllustratorError,
  formatCliError,
} from "./errors.js";
import type {
  CliOptions,
  GeneratedArtifact,
  GeneratedFileRecord,
} from "./cli-types.js";
import { loadReferenceImages, runGenerationOnce } from "./image-core.js";
import { getDefaultModel, resolveProviderAndKey } from "./provider.js";

export async function generateArtifacts(
  artifacts: GeneratedArtifact[],
  options: CliOptions,
): Promise<GeneratedFileRecord[]> {
  const references =
    options.refs.length > 0
      ? await loadReferenceImages(options.refs, {
          ignoreMissing: options.ignoreMissingRef,
        })
      : [];
  const resolved = resolveProviderAndKey({
    provider: options.provider,
    refPaths: references.length > 0 ? options.refs : [],
  });
  const provider = resolved.provider;
  const model = options.model || getDefaultModel(provider);
  const records: GeneratedFileRecord[] = [];

  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Outputs: ${artifacts.length}`);

  for (const artifact of artifacts) {
    await mkdir(dirname(artifact.outputPath), { recursive: true });
    const ext = extname(artifact.outputPath);
    const base = artifact.outputPath.slice(0, -ext.length);
    const allOutputs: string[] = [];

    for (let candidate = 1; candidate <= options.candidates; candidate++) {
      const outputPath =
        options.candidates > 1 ? `${base}-${candidate}${ext}` : artifact.outputPath;
      let itemRetryCount = 0;
      const { value: result, retryCount } = await runWithRetry(
        async (signal) => {
          const generated = await runGenerationOnce({
            provider,
            prompt: artifact.prompt,
            model,
            apiKey: resolved.apiKey,
            size: options.size,
            aspectRatio: artifact.aspectRatio,
            references,
            signal,
          });

          if (!generated) {
            throw new SmartIllustratorError({
              kind: "provider",
              code: "NO_IMAGE_GENERATED",
              message: `生成失败：${artifact.label}`,
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

      if (retryCount > 0 || itemRetryCount > 0) {
        console.log(`  ↻ Retried ${retryCount} time(s)`);
      }

      try {
        await writeFile(outputPath, result.imageData);
      } catch (error) {
        throw new SmartIllustratorError({
          kind: "export",
          code: "WRITE_IMAGE_FAILED",
          message: `写入图片失败：${outputPath}`,
          retryable: false,
          cause: error,
        });
      }
      allOutputs.push(outputPath);
      console.log(`Saved ${artifact.label}: ${outputPath}`);
    }

    records.push({
      label: artifact.label,
      primaryOutput: allOutputs[0],
      allOutputs,
    });
  }

  return records;
}
