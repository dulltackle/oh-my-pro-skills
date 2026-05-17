import { basename, join } from "node:path";
import { writeFile } from "node:fs/promises";
import type {
  AspectRatio,
  CliOptions,
  GeneratedArtifact,
  StyleName,
} from "./cli-types.js";
import {
  buildArticleSections,
  buildCoverSummary,
  buildSlidesPictures,
} from "./markdown-analyzer.js";
import {
  renderArticleMarkdown,
  writePromptBundle,
} from "./output-writer.js";
import {
  buildArticlePrompt,
  buildCoverPrompt,
  buildSlidesBatchConfig,
  buildSlidesPrompt,
  getDefaultAspectRatio,
} from "./prompt-builders.js";
import {
  getStyleMetadata,
  readStylePrompt,
  resolveStyleName,
} from "./style-loader.js";
import { generateArtifacts } from "./artifact-generator.js";

export interface ArtifactBuildContext {
  markdown: string;
  articleTitle: string;
  baseName: string;
  outputDir: string;
  options: CliOptions;
}

function resolveModeAspectRatio(
  mode: CliOptions["mode"] | "cover",
  fallback: "body" | "cover",
  options: CliOptions,
): { styleName: StyleName; aspectRatio: AspectRatio } {
  const styleName = resolveStyleName(mode, options.style, fallback);
  return {
    styleName,
    aspectRatio: getDefaultAspectRatio(
      mode,
      options.platform,
      options.aspectRatio,
      getStyleMetadata(styleName),
    ),
  };
}

export async function handleSlidesMode({
  markdown,
  articleTitle,
  baseName,
  outputDir,
  options,
}: ArtifactBuildContext): Promise<void> {
  const { styleName, aspectRatio } = resolveModeAspectRatio("slides", "body", options);
  const stylePrompt = await readStylePrompt(styleName);
  const pictures = buildSlidesPictures(markdown, articleTitle);
  const batchConfig = buildSlidesBatchConfig(stylePrompt, pictures, aspectRatio);

  if (options.promptOnly) {
    await writePromptBundle(join(outputDir, `${baseName}-slides.json`), batchConfig);
    return;
  }

  const artifacts = pictures.map((picture) => ({
    label: `slide-${picture.id}`,
    prompt: buildSlidesPrompt(stylePrompt, picture),
    outputPath: join(outputDir, `${baseName}-slide-${String(picture.id).padStart(2, "0")}.png`),
    aspectRatio,
  }));

  await generateArtifacts(artifacts, options);
}

export async function handleCoverMode({
  markdown,
  articleTitle,
  baseName,
  outputDir,
  options,
}: ArtifactBuildContext): Promise<void> {
  const { styleName, aspectRatio } = resolveModeAspectRatio("cover", "cover", options);
  const coverStyle = await readStylePrompt(styleName);
  const coverPrompt = buildCoverPrompt(
    coverStyle,
    articleTitle,
    markdown || articleTitle,
    options.platform,
    aspectRatio,
  );

  if (options.promptOnly) {
    await writePromptBundle(join(outputDir, `${baseName}-cover-prompt.json`), {
      mode: "cover",
      topic: articleTitle,
      platform: options.platform,
      aspectRatio,
      prompt: coverPrompt,
      output: `${baseName}-cover.png`,
    });
    return;
  }

  await generateArtifacts(
    [
      {
        label: "cover",
        prompt: coverPrompt,
        outputPath: join(outputDir, `${baseName}-cover.png`),
        aspectRatio,
      },
    ],
    options,
  );
}

export async function handleArticleMode({
  markdown,
  articleTitle,
  baseName,
  outputDir,
  options,
}: ArtifactBuildContext): Promise<void> {
  const body = resolveModeAspectRatio("article", "body", options);
  const bodyStyle = await readStylePrompt(body.styleName);
  const cover = options.noCover
    ? null
    : resolveModeAspectRatio("cover", "cover", { ...options, style: null });
  const coverStyle = cover ? await readStylePrompt(cover.styleName) : null;
  const articleSections = buildArticleSections(markdown, articleTitle);
  const artifacts: GeneratedArtifact[] = [];

  if (cover && coverStyle) {
    artifacts.push({
      label: "cover",
      prompt: buildCoverPrompt(
        coverStyle,
        articleTitle,
        buildCoverSummary(markdown),
        options.platform,
        cover.aspectRatio,
      ),
      outputPath: join(outputDir, `${baseName}-cover.png`),
      aspectRatio: cover.aspectRatio,
    });
  }

  articleSections.forEach((section, index) => {
    artifacts.push({
      label: `article-image-${index + 1}`,
      prompt: buildArticlePrompt(bodyStyle, articleTitle, section),
      outputPath: join(
        outputDir,
        `${baseName}-image-${String(index + 1).padStart(2, "0")}.png`,
      ),
      aspectRatio: body.aspectRatio,
    });
  });

  if (options.promptOnly) {
    await writePromptBundle(join(outputDir, `${baseName}-article-prompts.json`), {
      mode: "article",
      articleTitle,
      cover: cover
        ? {
            output: `${baseName}-cover.png`,
            aspectRatio: cover.aspectRatio,
            prompt: artifacts[0]?.label === "cover" ? artifacts[0].prompt : null,
          }
        : null,
      illustrations: articleSections.map((section, index) => ({
        section: section.title,
        output: `${baseName}-image-${String(index + 1).padStart(2, "0")}.png`,
        aspectRatio: body.aspectRatio,
        prompt: buildArticlePrompt(bodyStyle, articleTitle, section),
      })),
    });
    return;
  }

  const records = await generateArtifacts(artifacts, options);
  const coverRecord = records.find((record) => record.label === "cover");
  const sectionRecords = records.filter((record) => record.label !== "cover");
  const outputMarkdown = renderArticleMarkdown(
    markdown,
    coverRecord ? basename(coverRecord.primaryOutput) : null,
    sectionRecords.map((record) => basename(record.primaryOutput)),
  );
  const outputMarkdownPath = join(outputDir, `${baseName}-image.md`);
  await writeFile(outputMarkdownPath, outputMarkdown, "utf-8");
  console.log(`Saved article output: ${outputMarkdownPath}`);
}
