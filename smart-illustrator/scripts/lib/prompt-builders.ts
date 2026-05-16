import type { Platform } from "./cli-types.js";
import { compactText, type MarkdownSection, type SlidePicture } from "./markdown-analyzer.js";
import type { AspectRatio } from "./provider.js";
import type { StyleMetadata } from "./style-loader.js";

export const PLATFORM_ASPECTS: Record<Platform, AspectRatio> = {
  youtube: "16:9",
  wechat: "21:9",
  twitter: "16:9",
  xiaohongshu: "3:4",
  landscape: "16:9",
};

export function buildSlidesBatchConfig(
  stylePrompt: string,
  pictures: SlidePicture[],
  aspectRatio: AspectRatio,
) {
  return {
    instruction: `请逐条生成以下 ${pictures.length} 张独立信息图。每个 picture 只生成 1 张图，严禁合并，严禁只输出文字描述。`,
    batch_rules: {
      total: pictures.length,
      one_item_one_image: true,
      aspect_ratio: aspectRatio,
      do_not_merge: true,
    },
    fallback:
      "如果无法一次生成全部图片，请保留 pictures 的编号并逐条单图执行。",
    style: stylePrompt,
    pictures,
  };
}

export function buildArticlePrompt(
  stylePrompt: string,
  articleTitle: string,
  section: MarkdownSection,
): string {
  return `${stylePrompt}

---

请为以下文章片段生成一张正文配图。只表达一个核心概念，不要把整篇文章塞进一张图。

文章标题：${articleTitle}
段落主题：${section.title}

内容摘录：
${compactText(section.content, 1200)}`;
}

export function buildSlidesPrompt(
  stylePrompt: string,
  picture: SlidePicture,
): string {
  return `${stylePrompt}

---

请为以下内容生成一张独立信息图，保持一页一图，严禁与其他主题合并。

主题方向：${picture.topic}

内容：
${picture.content}`;
}

export function buildCoverPrompt(
  stylePrompt: string,
  topic: string,
  summary: string,
  platform: Platform,
  aspectRatio: AspectRatio,
): string {
  return `${stylePrompt}

---

请为以下主题生成封面图。

主题：${topic}
平台：${platform}
目标宽高比：${aspectRatio}

内容摘要：
${compactText(summary, 1000)}`;
}

export function getDefaultAspectRatio(
  mode: "article" | "slides" | "cover",
  platform: Platform,
  override?: AspectRatio,
  styleMetadata?: Pick<StyleMetadata, "defaultAspectRatio">,
): AspectRatio {
  if (override) return override;
  if (mode === "cover") return PLATFORM_ASPECTS[platform];
  return styleMetadata?.defaultAspectRatio ?? "16:9";
}
