import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import styleIndex from "../../styles/index.json" with { type: "json" };
import type { Mode, StyleName } from "./cli-types.js";
import type { AspectRatio } from "./provider.js";
import { SmartIllustratorError } from "./errors.js";

export interface StyleMetadata {
  file: string;
  targets: Mode[];
  defaultAspectRatio: AspectRatio;
}

const STYLE_INDEX = styleIndex as Record<StyleName, StyleMetadata>;

export function getStyleMetadata(styleName: StyleName): StyleMetadata {
  const metadata = STYLE_INDEX[styleName];
  if (!metadata) {
    throw new SmartIllustratorError({
      kind: "style",
      code: "STYLE_NOT_FOUND",
      message: `未找到 style：${styleName}`,
      retryable: false,
    });
  }
  return metadata;
}

export async function readStylePrompt(styleName: StyleName): Promise<string> {
  const metadata = getStyleMetadata(styleName);
  const stylePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../styles",
    metadata.file,
  );
  try {
    return await readFile(stylePath, "utf-8");
  } catch (error) {
    throw new SmartIllustratorError({
      kind: "style",
      code: "STYLE_READ_FAILED",
      message: `读取 style 文件失败：${metadata.file}`,
      retryable: false,
      cause: error,
    });
  }
}

export function resolveStyleName(
  mode: Mode,
  provided: StyleName | null,
  target: "body" | "cover",
): StyleName {
  if (provided) {
    const metadata = getStyleMetadata(provided);
    if (!metadata.targets.includes(mode)) {
      const available = (Object.keys(STYLE_INDEX) as StyleName[])
        .filter((styleName) => getStyleMetadata(styleName).targets.includes(mode))
        .join(" / ");
      throw new SmartIllustratorError({
        kind: "style",
        code: "STYLE_MODE_NOT_SUPPORTED",
        message: `style ${provided} 不支持 ${mode} 模式，可用 style：${available}`,
        retryable: false,
      });
    }
    return provided;
  }

  const preferred: StyleName = "light";
  if (getStyleMetadata(preferred).targets.includes(mode)) {
    return preferred;
  }

  return (Object.keys(STYLE_INDEX) as StyleName[]).find((styleName) =>
    getStyleMetadata(styleName).targets.includes(mode)
  ) ?? "light";
}
