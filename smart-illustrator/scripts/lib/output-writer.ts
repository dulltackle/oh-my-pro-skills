import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { SmartIllustratorError } from "./errors.js";
import { getNextMarkdownFenceState, type MarkdownFenceState } from "./markdown-analyzer.js";

export function sanitizeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "smart-illustrator"
  );
}

export function deriveBaseName(
  inputPath: string | null,
  topic: string | null,
): string {
  if (inputPath) {
    return basename(inputPath, extname(inputPath));
  }
  return sanitizeFilename(topic || "cover");
}

export async function writePromptBundle(
  outputPath: string,
  payload: unknown,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    console.log(`Saved prompt bundle: ${outputPath}`);
  } catch (error) {
    throw new SmartIllustratorError({
      kind: "export",
      code: "WRITE_PROMPT_BUNDLE_FAILED",
      message: `写入 prompt 文件失败：${outputPath}`,
      retryable: false,
      cause: error,
    });
  }
}

export function renderArticleMarkdown(
  sourceMarkdown: string,
  coverImage: string | null,
  sectionImages: string[],
): string {
  const lines = sourceMarkdown.split(/\r?\n/);
  const rendered: string[] = [];
  let coverInserted = false;
  let sectionImageIndex = 0;
  let hasH1 = false;
  let hasSectionHeading = false;
  let activeFence: MarkdownFenceState | null = null;

  for (const line of lines) {
    const nextFenceState = getNextMarkdownFenceState(activeFence, line);
    if (nextFenceState !== undefined) {
      activeFence = nextFenceState;
      rendered.push(line);
      continue;
    }

    if (activeFence) {
      rendered.push(line);
      continue;
    }

    if (/^#\s+/.test(line)) {
      hasH1 = true;
      rendered.push(line);
      if (coverImage && !coverInserted) {
        rendered.push("", `![封面](${coverImage})`, "");
        coverInserted = true;
      }
      continue;
    }

    if (/^#{2,3}\s+/.test(line) && sectionImageIndex < sectionImages.length) {
      hasSectionHeading = true;
      rendered.push("", `![配图](${sectionImages[sectionImageIndex]})`, "");
      sectionImageIndex += 1;
    }

    rendered.push(line);
  }

  if (!hasH1 && coverImage) {
    rendered.unshift(`![封面](${coverImage})`, "");
  }

  if (!hasSectionHeading && sectionImages.length > 0) {
    rendered.push("", `![配图](${sectionImages[0]})`, "");
  }

  return rendered.join("\n").replace(/\n{4,}/g, "\n\n\n");
}
