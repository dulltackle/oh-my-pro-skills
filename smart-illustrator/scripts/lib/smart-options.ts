import { resolve } from "node:path";
import { loadConfig, mergeConfig } from "../config.js";
import {
  ASPECT_RATIOS,
  MODES,
  PLATFORMS,
  PROVIDERS,
  SIZES,
  STYLE_NAMES,
} from "./cli-metadata.js";
import { parseCliArgs, type CliOptionSpec } from "./cli-args.js";
import { SmartIllustratorError } from "./errors.js";
import type {
  CliOptions,
  Mode,
  Platform,
  StyleName,
} from "./cli-types.js";

const SMART_CLI_SPECS: CliOptionSpec[] = [
  { name: "help", aliases: ["-h"], type: "boolean" },
  { name: "mode", type: "string", choices: MODES, defaultValue: "article" },
  { name: "style", type: "string", choices: STYLE_NAMES },
  { name: "platform", type: "string", choices: PLATFORMS },
  { name: "topic", type: "string" },
  { name: "prompt-only", type: "boolean" },
  { name: "no-cover", type: "boolean" },
  { name: "ref", aliases: ["-r"], type: "string", repeatable: true },
  { name: "ignore-missing-ref", type: "boolean" },
  { name: "candidates", aliases: ["-c"], type: "integer", min: 1, max: 4 },
  { name: "aspect-ratio", aliases: ["-a"], type: "string", choices: ASPECT_RATIOS },
  { name: "provider", type: "string", choices: PROVIDERS },
  { name: "model", type: "string" },
  { name: "size", type: "string", choices: SIZES },
  { name: "output-dir", type: "string" },
  { name: "timeout", type: "integer", min: 1000, defaultValue: 600_000 },
  { name: "max-retries", type: "integer", min: 0, max: 2, defaultValue: 1 },
  { name: "backoff-base", type: "integer", min: 100, defaultValue: 1_200 },
];

type ParsedSmartOptions = Omit<CliOptions, "platform" | "refs" | "candidates" | "size"> & {
  platform?: Platform;
  refs: string[];
  candidates?: number;
  size?: CliOptions["size"];
};

export function printSmartUsage(): never {
  console.log(`
Smart Illustrator CLI

Usage:
  npx --yes tsx scripts/smart-illustrator.ts <input.md> [options]
  npx --yes tsx scripts/smart-illustrator.ts --mode cover --topic "主题" [options]

Modes:
  article                 Generate article illustrations and an optional cover
  slides                  Split a markdown outline into one-image-per-slide outputs
  cover                   Generate only the cover image

Options:
  --mode <mode>           article | slides | cover (default: article)
  --style <name>          ${STYLE_NAMES.join(" | ")}
  --platform <name>       ${PLATFORMS.join(" | ")}
  --topic <text>          Required for cover mode when no input file is provided
  --prompt-only           Output prompts/JSON only, skip image generation
  --no-cover              Skip cover generation in article mode
  -r, --ref <path>        Reference image path (repeatable, max 3 used)
  --ignore-missing-ref    Skip unreadable --ref paths instead of failing
  -c, --candidates <n>    Generate multiple candidates per output (max 4)
  -a, --aspect-ratio <r>  Override the default aspect ratio
  --provider <name>       ${PROVIDERS.join(" | ")}
  --model <name>          Override the provider default model
  --size <size>           ${SIZES.join(" | ")} (default: 2k)
  --output-dir <path>     Output directory (default: input file directory or cwd)
  --timeout <ms>          Per-image timeout in ms (default: 600000)
  --max-retries <n>       Retry transient failures (0-2, default: 1)
  --backoff-base <ms>     Retry backoff base delay in ms (default: 1200)
  -h, --help              Show this help

Examples:
  npx --yes tsx scripts/smart-illustrator.ts article.md
  npx --yes tsx scripts/smart-illustrator.ts article.md --mode slides --prompt-only
  npx --yes tsx scripts/smart-illustrator.ts --mode cover --topic "AI 工作流" --platform youtube
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

export function parseSmartArgs(argv: string[]): ParsedSmartOptions {
  const parsed = parseCliArgs(argv, SMART_CLI_SPECS);
  if (parsed.values.help) {
    printSmartUsage();
  }
  if (parsed.positionals.length > 1) {
    throw new SmartIllustratorError({
      kind: "input",
      message: `只允许一个输入文件，检测到多余参数：${parsed.positionals[1]}`,
      retryable: false,
    });
  }

  return {
    inputPath: parsed.positionals[0] ?? null,
    mode: parsed.values.mode as Mode,
    style: (parsed.values.style as StyleName | undefined) ?? null,
    platform: parsed.values.platform as Platform | undefined,
    topic: (parsed.values.topic as string | undefined) ?? null,
    promptOnly: parsed.values["prompt-only"] === true,
    noCover: parsed.values["no-cover"] === true,
    refs: stringArray(parsed.values.ref),
    ignoreMissingRef: parsed.values["ignore-missing-ref"] === true,
    candidates: parsed.values.candidates as number | undefined,
    aspectRatio: parsed.values["aspect-ratio"] as CliOptions["aspectRatio"],
    provider: (parsed.values.provider as CliOptions["provider"] | undefined) ?? null,
    model: (parsed.values.model as string | undefined) ?? null,
    size: parsed.values.size as CliOptions["size"] | undefined,
    outputDir: (parsed.values["output-dir"] as string | undefined) ?? null,
    timeoutMs: parsed.values.timeout as number,
    maxRetries: parsed.values["max-retries"] as number,
    backoffBaseMs: parsed.values["backoff-base"] as number,
  };
}

export function resolveSmartOptions(
  parsed: ParsedSmartOptions,
  cwd: string,
): CliOptions {
  let loadedConfig: ReturnType<typeof loadConfig>;
  try {
    loadedConfig = loadConfig(cwd);
  } catch (error) {
    throw new SmartIllustratorError({
      kind: "config",
      code: "LOAD_CONFIG_FAILED",
      message: "读取配置失败",
      retryable: false,
      cause: error,
    });
  }
  const resolvedConfig = mergeConfig(loadedConfig, {
    style: parsed.style ?? undefined,
    platform: parsed.platform,
    provider: parsed.provider ?? undefined,
    model: parsed.model ?? undefined,
    size: parsed.size,
    aspectRatio: parsed.aspectRatio,
    references: parsed.refs.length > 0 ? parsed.refs.map((ref) => resolve(cwd, ref)) : undefined,
    candidates: parsed.candidates,
    outputDir: parsed.outputDir ? resolve(cwd, parsed.outputDir) : undefined,
  });

  return {
    ...parsed,
    style: resolvedConfig.style ?? null,
    platform: resolvedConfig.platform ?? "youtube",
    refs: resolvedConfig.references ?? [],
    candidates: resolvedConfig.candidates ?? 1,
    provider: resolvedConfig.provider ?? null,
    model: resolvedConfig.model ?? null,
    size: resolvedConfig.size ?? "2k",
    aspectRatio: resolvedConfig.aspectRatio ?? parsed.aspectRatio,
    outputDir: resolvedConfig.outputDir ?? null,
    timeoutMs: parsed.timeoutMs,
    maxRetries: parsed.maxRetries,
    backoffBaseMs: parsed.backoffBaseMs,
  };
}

export function validateSmartOptions(options: CliOptions): void {
  if ((options.mode === "article" || options.mode === "slides") && !options.inputPath) {
    throw new SmartIllustratorError({
      kind: "input",
      message: `${options.mode} 模式必须提供 Markdown 输入文件`,
      retryable: false,
    });
  }
  if (options.mode === "cover" && !options.inputPath && !options.topic) {
    throw new SmartIllustratorError({
      kind: "input",
      message: "cover 模式在无输入文件时必须提供 --topic",
      retryable: false,
    });
  }
}
