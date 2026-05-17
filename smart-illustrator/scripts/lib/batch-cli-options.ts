import {
  ASPECT_RATIOS,
  PROVIDERS,
  SIZES,
} from "./cli-metadata.js";
import { parseCliArgs, type CliOptionSpec } from "./cli-args.js";
import type {
  AspectRatio,
  Provider,
  Size,
} from "./provider.js";

const BATCH_CLI_SPECS: CliOptionSpec[] = [
  { name: "help", aliases: ["-h"], type: "boolean" },
  { name: "config", aliases: ["-c"], type: "string" },
  { name: "output-dir", aliases: ["-o"], type: "string", defaultValue: "./illustrations" },
  { name: "model", aliases: ["-m"], type: "string" },
  { name: "provider", type: "string", choices: PROVIDERS },
  { name: "size", type: "string", choices: SIZES, defaultValue: "2k" },
  { name: "aspect-ratio", aliases: ["-a"], type: "string", choices: ASPECT_RATIOS },
  { name: "ref", aliases: ["--reference"], type: "string", repeatable: true },
  { name: "ignore-missing-ref", type: "boolean" },
  { name: "delay", aliases: ["-d"], type: "integer", min: 0, defaultValue: 2000 },
  { name: "timeout", type: "integer", min: 1000, defaultValue: 600_000 },
  { name: "max-retries", type: "integer", min: 0, max: 2, defaultValue: 1 },
  { name: "backoff-base", type: "integer", min: 100, defaultValue: 1_200 },
  { name: "prefix", aliases: ["-p"], type: "string" },
  { name: "regenerate", aliases: ["-r"], type: "string" },
  { name: "force", aliases: ["-f"], type: "boolean" },
];

export interface BatchCliOptions {
  configPath: string | null;
  outputDir: string;
  model: string | null;
  requestedProvider: Provider | null;
  size: Size;
  cliAspectRatio?: AspectRatio;
  refPaths: string[];
  ignoreMissingRef: boolean;
  delay: number;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  prefix: string | null;
  forceRegenerate: boolean;
  regenerateValue?: string;
}

export function printBatchUsage(): never {
  console.log(`
Batch Image Generation Script

Usage:
  npx --yes tsx batch-generate.ts --config slides.json --output-dir ./images

Options:
  -c, --config <path>       JSON config file (unified format only)
  -o, --output-dir <path>   Output directory (default: ./illustrations)
  -m, --model <model>       Model to use (default: provider default model)
  --provider <provider>     API provider: tuzi or tuzi-openai
  --size <size>             Image size: 2k (default) or default
  -a, --aspect-ratio <ratio>  Override config aspect ratio
  --ref <path>              Reference image for style (can use multiple, max 3)
  --ignore-missing-ref      Skip unreadable --ref paths instead of failing
  -d, --delay <ms>          Delay between requests in ms (default: 2000)
  --timeout <ms>            Per-image timeout in ms (default: 600000)
  --max-retries <n>         Retry transient failures (0-2, default: 1)
  --backoff-base <ms>       Retry backoff base delay in ms (default: 1200)
  -p, --prefix <text>       Filename prefix (default: from config filename)
  -r, --regenerate <ids>    Regenerate specific images (e.g., "3" or "3,5,7")
  -f, --force               Force regenerate all images (ignore existing)
  -h, --help                Show this help

Resume Generation:
  By default, the script skips images that already exist in the output directory.
  This allows you to resume interrupted generation without re-generating completed images.
  Use --force to regenerate all images, or --regenerate to regenerate specific ones.

Environment:
  TUZI_API_KEY              Tuzi API key (Google-compatible and OpenAI-compatible endpoints)
  TUZI_OPENAI_API_BASE      Optional Tuzi OpenAI-compatible API base

Config File Format (only unified JSON format is supported):
  {
    "instruction": "请为我绘制 7 张图片（generate 7 images）...",
    "batch_rules": {
      "total": 7,
      "one_item_one_image": true,
      "aspect_ratio": "16:9",
      "do_not_merge": true
    },
    "fallback": "如果无法一次生成全部图片...",
    "style": "完整的 style prompt（从 styles/style-light.md 复制）...",
    "pictures": [
      { "id": 1, "topic": "封面", "content": "Agent Skills 完全指南\\n\\n第1节：..." },
      { "id": 2, "topic": "核心概念", "content": "Skills 是什么..." }
    ]
  }

Output Filenames:
  {prefix}-{id:02d}.png  (e.g., SKILL_01-01.png, SKILL_01-02.png)
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

export function parseBatchCliOptions(argv: string[]): BatchCliOptions {
  const parsed = parseCliArgs(argv, BATCH_CLI_SPECS, {
    allowPositionals: false,
  });
  if (parsed.values.help) {
    printBatchUsage();
  }

  return {
    configPath: (parsed.values.config as string | undefined) ?? null,
    outputDir: parsed.values["output-dir"] as string,
    model: (parsed.values.model as string | undefined) ?? null,
    requestedProvider: (parsed.values.provider as Provider | undefined) ?? null,
    size: parsed.values.size as Size,
    cliAspectRatio: parsed.values["aspect-ratio"] as AspectRatio | undefined,
    refPaths: stringArray(parsed.values.ref),
    ignoreMissingRef: parsed.values["ignore-missing-ref"] === true,
    delay: parsed.values.delay as number,
    timeoutMs: parsed.values.timeout as number,
    maxRetries: parsed.values["max-retries"] as number,
    backoffBaseMs: parsed.values["backoff-base"] as number,
    prefix: (parsed.values.prefix as string | undefined) ?? null,
    forceRegenerate: parsed.values.force === true,
    regenerateValue: parsed.values.regenerate as string | undefined,
  };
}
