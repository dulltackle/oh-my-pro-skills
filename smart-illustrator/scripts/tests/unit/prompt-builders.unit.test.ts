import { describe, expect, it } from "vitest";
import {
  buildArticlePrompt,
  buildCoverPrompt,
  buildSlidesBatchConfig,
  buildSlidesPrompt,
  getDefaultAspectRatio,
} from "../../lib/prompt-builders.js";

describe("prompt-builders", () => {
  it("builds unified slides batch config", () => {
    expect(
      buildSlidesBatchConfig(
        "风格提示",
        [
          { id: 1, topic: "封面", content: "封面内容" },
          { id: 2, topic: "核心概念", content: "正文内容" },
        ],
        "21:9",
      ),
    ).toEqual({
      instruction:
        "请逐条生成以下 2 张独立信息图。每个 picture 只生成 1 张图，严禁合并，严禁只输出文字描述。",
      batch_rules: {
        total: 2,
        one_item_one_image: true,
        aspect_ratio: "21:9",
        do_not_merge: true,
      },
      fallback: "如果无法一次生成全部图片，请保留 pictures 的编号并逐条单图执行。",
      style: "风格提示",
      pictures: [
        { id: 1, topic: "封面", content: "封面内容" },
        { id: 2, topic: "核心概念", content: "正文内容" },
      ],
    });
  });

  it("builds article prompt with compacted content", () => {
    const prompt = buildArticlePrompt("风格提示", "AI 工作流", {
      level: 2,
      title: "方案设计",
      content: `**目标**：${"内容".repeat(700)}`,
    });

    expect(prompt).toContain("请为以下文章片段生成一张正文配图");
    expect(prompt).toContain("文章标题：AI 工作流");
    expect(prompt).toContain("段落主题：方案设计");
    expect(prompt).toContain("目标：");
    expect(prompt).toContain("...");
    expect(prompt).not.toContain("**目标**");
  });

  it("builds slides and cover prompts with required metadata", () => {
    const slidesPrompt = buildSlidesPrompt("风格提示", {
      id: 2,
      topic: "核心概念",
      content: "一页一图的正文内容",
    });
    expect(slidesPrompt).toContain("保持一页一图");
    expect(slidesPrompt).toContain("主题方向：核心概念");
    expect(slidesPrompt).toContain("一页一图的正文内容");

    const coverPrompt = buildCoverPrompt(
      "风格提示",
      "AI 工作流",
      `**摘要**：${"信息".repeat(600)}`,
      "xiaohongshu",
      "3:4",
    );
    expect(coverPrompt).toContain("请为以下主题生成封面图");
    expect(coverPrompt).toContain("主题：AI 工作流");
    expect(coverPrompt).toContain("平台：xiaohongshu");
    expect(coverPrompt).toContain("目标宽高比：3:4");
    expect(coverPrompt).toContain("摘要：");
    expect(coverPrompt).toContain("...");
    expect(coverPrompt).not.toContain("**摘要**");
  });

  it("resolves default aspect ratio by mode and platform", () => {
    expect(getDefaultAspectRatio("article", "wechat")).toBe("16:9");
    expect(
      getDefaultAspectRatio("slides", "xiaohongshu", undefined, {
        defaultAspectRatio: "4:5",
      }),
    ).toBe("4:5");
    expect(getDefaultAspectRatio("cover", "wechat")).toBe("21:9");
    expect(
      getDefaultAspectRatio("cover", "twitter", undefined, {
        defaultAspectRatio: "4:5",
      }),
    ).toBe("16:9");
    expect(getDefaultAspectRatio("cover", "twitter", "1:1")).toBe("1:1");
  });
});
