import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ApiBaseUrls {
  tuzi: string;
  tuziOpenai: string;
  gemini: string;
}
export const DEFAULT_TUZI_API_BASE = "https://api.tu-zi.com/v1beta/models";
export const DEFAULT_TUZI_OPENAI_API_BASE = "https://api.tu-zi.com/v1";
export const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const exportPrefix = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const equalIndex = exportPrefix.indexOf("=");
    if (equalIndex <= 0) continue;

    const key = exportPrefix.slice(0, equalIndex).trim();
    let value = exportPrefix.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

export async function loadDotenvIntoProcessEnv(envPath: string): Promise<void> {
  try {
    const content = await readFile(envPath, "utf-8");
    const parsed = parseDotenv(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing/unreadable env file.
  }
}

export async function bootstrapEnv(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidateEnvFiles = [
    resolve(process.cwd(), ".env"),
    resolve(scriptDir, "../../.env"),
  ];

  for (const envFile of candidateEnvFiles) {
    await loadDotenvIntoProcessEnv(envFile);
  }
}

export function getApiBaseUrls(
  overrides: Partial<ApiBaseUrls> = {},
): ApiBaseUrls {
  return {
    tuzi: overrides.tuzi || process.env.TUZI_API_BASE || DEFAULT_TUZI_API_BASE,
    tuziOpenai:
      overrides.tuziOpenai ||
      process.env.TUZI_OPENAI_API_BASE ||
      DEFAULT_TUZI_OPENAI_API_BASE,
    gemini:
      overrides.gemini ||
      process.env.GEMINI_API_BASE ||
      DEFAULT_GEMINI_API_BASE,
  };
}
