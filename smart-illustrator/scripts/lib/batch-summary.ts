import { resolve } from "node:path";
import type { ErrorKind } from "./errors.js";
import type {
  AspectRatio,
  Provider,
  Size,
} from "./provider.js";

export type BatchItemStatus = "generated" | "skipped" | "failed";

export interface BatchItemResult {
  id: number;
  topic: string;
  filename: string;
  outputPath: string;
  status: BatchItemStatus;
  retryCount: number;
  errorType?: ErrorKind;
  error?: string;
}

export interface BatchSummary {
  generatedAt: string;
  configPath: string;
  outputDir: string;
  summaryPath: string;
  provider: string;
  model: string;
  size: Size;
  aspectRatio?: AspectRatio;
  references: {
    count: number;
    paths: string[];
  };
  prefix: string;
  total: number;
  counts: {
    generated: number;
    skipped: number;
    failed: number;
    retried: number;
  };
  items: BatchItemResult[];
}

export interface BuildBatchSummaryOptions {
  configPath: string;
  outputDir: string;
  summaryPath: string;
  provider: Provider;
  model: string;
  size: Size;
  aspectRatio?: AspectRatio;
  refPaths: string[];
  referenceCount: number;
  prefix: string;
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  retried: number;
  items: BatchItemResult[];
}

function shellQuote(value: string): string {
  if (value === "") {
    return "''";
  }

  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'` + value.replace(/'/g, `'\"'\"'`) + `'`;
}

export function buildRetryCommand(
  configPath: string,
  outputDir: string,
  provider: Provider,
  size: Size,
  aspectRatio: AspectRatio | undefined,
  refPaths: string[],
  ignoreMissingRef: boolean,
  delay: number,
  timeoutMs: number,
  maxRetries: number,
  backoffBaseMs: number,
  failedIds: number[],
): string {
  return [
    "node",
    "--import",
    "tsx",
    "batch-generate.ts",
    "--config",
    shellQuote(configPath),
    "--output-dir",
    shellQuote(outputDir),
    "--provider",
    provider,
    "--size",
    size,
    ...(aspectRatio ? ["--aspect-ratio", aspectRatio] : []),
    ...refPaths.flatMap((refPath) => ["--ref", shellQuote(refPath)]),
    ...(ignoreMissingRef ? ["--ignore-missing-ref"] : []),
    "--delay",
    String(delay),
    "--timeout",
    String(timeoutMs),
    "--max-retries",
    String(maxRetries),
    "--backoff-base",
    String(backoffBaseMs),
    "--regenerate",
    failedIds.join(","),
  ].join(" ");
}

export function buildBatchSummary(options: BuildBatchSummaryOptions): BatchSummary {
  return {
    generatedAt: new Date().toISOString(),
    configPath: options.configPath,
    outputDir: options.outputDir,
    summaryPath: options.summaryPath,
    provider: options.provider,
    model: options.model,
    size: options.size,
    aspectRatio: options.aspectRatio,
    references: {
      count: options.referenceCount,
      paths: options.refPaths.map((refPath) => resolve(refPath)),
    },
    prefix: options.prefix,
    total: options.total,
    counts: {
      generated: options.generated,
      skipped: options.skipped,
      failed: options.failed,
      retried: options.retried,
    },
    items: options.items,
  };
}
