import { SmartIllustratorError } from "./errors.js";

export type CliOptionType = "boolean" | "string" | "integer";

export interface CliOptionSpec {
  name: string;
  aliases?: string[];
  type: CliOptionType;
  choices?: readonly string[];
  repeatable?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  removedMessage?: string;
}

export interface ParsedCliArgs {
  values: Record<string, string | number | boolean | string[] | number[]>;
  positionals: string[];
}

export interface ParseCliArgsOptions {
  allowPositionals?: boolean;
}

function optionTokens(spec: CliOptionSpec): string[] {
  return [`--${spec.name}`, ...(spec.aliases || [])];
}

function displayName(spec: CliOptionSpec): string {
  return optionTokens(spec).join(" / ");
}

function buildIndex(specs: CliOptionSpec[]): Map<string, CliOptionSpec> {
  const index = new Map<string, CliOptionSpec>();
  for (const spec of specs) {
    for (const token of optionTokens(spec)) {
      index.set(token, spec);
    }
  }
  return index;
}

function fail(message: string): never {
  throw new SmartIllustratorError({
    kind: "input",
    message,
    retryable: false,
  });
}

function parseInteger(raw: string, spec: CliOptionSpec): number {
  if (!/^-?\d+$/.test(raw.trim())) {
    fail(`${displayName(spec)} 必须是整数：${raw}`);
  }

  let value = parseInt(raw, 10);
  if (spec.min !== undefined) {
    value = Math.max(spec.min, value);
  }
  if (spec.max !== undefined) {
    value = Math.min(spec.max, value);
  }
  return value;
}

function parseValue(raw: string, spec: CliOptionSpec): string | number {
  if (spec.choices && !spec.choices.includes(raw)) {
    fail(
      `${displayName(spec)} 不支持：${raw}，可选值：${spec.choices.join(" | ")}`,
    );
  }

  if (spec.type === "integer") {
    return parseInteger(raw, spec);
  }

  return raw;
}

function storeValue(
  values: ParsedCliArgs["values"],
  spec: CliOptionSpec,
  value: string | number | boolean,
): void {
  if (!spec.repeatable) {
    values[spec.name] = value;
    return;
  }

  const existing = values[spec.name];
  if (Array.isArray(existing)) {
    (existing as Array<string | number | boolean>).push(value);
    return;
  }

  values[spec.name] = [value] as string[] | number[];
}

export function parseCliArgs(
  argv: string[],
  specs: CliOptionSpec[],
  options: ParseCliArgsOptions = {},
): ParsedCliArgs {
  const allowPositionals = options.allowPositionals ?? true;
  const values: ParsedCliArgs["values"] = {};
  const positionals: string[] = [];
  const index = buildIndex(specs);

  for (const spec of specs) {
    if (spec.defaultValue !== undefined) {
      values[spec.name] = spec.defaultValue;
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      const rest = argv.slice(i + 1);
      if (!allowPositionals && rest.length > 0) {
        fail(`不允许位置参数：${rest[0]}`);
      }
      positionals.push(...rest);
      break;
    }

    if (!arg.startsWith("-")) {
      if (!allowPositionals) {
        fail(`不允许位置参数：${arg}`);
      }
      positionals.push(arg);
      continue;
    }

    const equalIndex = arg.indexOf("=");
    const token = equalIndex >= 0 ? arg.slice(0, equalIndex) : arg;
    const inlineValue = equalIndex >= 0 ? arg.slice(equalIndex + 1) : undefined;
    const spec = index.get(token);
    if (!spec) {
      fail(`未知参数：${token}`);
    }

    if (spec.removedMessage) {
      fail(spec.removedMessage);
    }

    if (spec.type === "boolean") {
      if (inlineValue !== undefined && inlineValue !== "") {
        fail(`${displayName(spec)} 是布尔开关，不接受值`);
      }
      storeValue(values, spec, true);
      continue;
    }

    const rawValue = inlineValue ?? argv[++i];
    if (
      rawValue === undefined ||
      rawValue === "" ||
      (inlineValue === undefined && rawValue.startsWith("-"))
    ) {
      fail(`${displayName(spec)} 缺少参数值`);
    }

    storeValue(values, spec, parseValue(rawValue, spec));
  }

  return { values, positionals };
}
