import { describe, expect, it } from "vitest";
import {
  buildArticleSections,
  buildSlidesPictures,
  compactText,
  extractDocumentTitle,
  splitMarkdownSections,
  stripMarkdown,
} from "../../lib/markdown-analyzer.js";

describe("markdown-analyzer", () => {
  it("strips markdown formatting while preserving readable text", () => {
    const markdown = `# 标题

> 引用

- 列表项
1. 编号项

这是 **重点** 和 *说明*，还有 [链接](https://example.com)。

\`inline\`

![配图](cover.png)

\`\`\`ts
const ignored = true;
\`\`\``;

    expect(stripMarkdown(markdown)).toBe(
      "标题\n\n引用\n\n列表项\n编号项\n\n这是 重点 和 说明，还有 链接。\n\ninline",
    );
  });

  it("compacts text and appends ellipsis when over limit", () => {
    expect(compactText("**abcdef**", 4)).toBe("abcd...");
    expect(compactText("**abc**", 10)).toBe("abc");
  });

  it("splits markdown into preface and heading sections", () => {
    const sections = splitMarkdownSections(`导语第一段
第二行

## 第一节
内容 A

### 细节
内容 B`);

    expect(sections).toEqual([
      {
        level: 0,
        title: "",
        content: "导语第一段\n第二行",
        lines: ["导语第一段", "第二行", ""],
      },
      {
        level: 2,
        title: "第一节",
        content: "内容 A",
        lines: ["内容 A", ""],
      },
      {
        level: 3,
        title: "细节",
        content: "内容 B",
        lines: ["内容 B"],
      },
    ]);
  });

  it("ignores heading-like lines inside fenced code blocks", () => {
    const sections = splitMarkdownSections(`导语

\`\`\`md
## fake heading
示例内容
\`\`\`

## 真正标题
真实内容`);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("");
    expect(sections[0].content).toContain("## fake heading");
    expect(sections[1]).toMatchObject({
      level: 2,
      title: "真正标题",
      content: "真实内容",
    });
  });

  it("supports tilde fences when splitting sections", () => {
    const sections = splitMarkdownSections(`~~~markdown
### fake heading
~~~

## 真标题
正文`);

    expect(sections).toHaveLength(2);
    expect(sections[0].content).toContain("### fake heading");
    expect(sections[1]).toMatchObject({
      level: 2,
      title: "真标题",
      content: "正文",
    });
  });

  it("extracts title from h1 or falls back to first readable line", () => {
    expect(extractDocumentTitle("# 主标题\n\n正文", "兜底")).toBe("主标题");
    expect(extractDocumentTitle("**无标题文档**\n\n正文", "兜底")).toBe("无标题文档");
  });

  it("prefers level-two and level-three sections for article generation", () => {
    const sections = buildArticleSections(
      `# AI 工作流

导语内容足够长，应该不会被选中。

## 背景
这一节介绍背景信息，长度足够用于正文配图。

### 方案
这一节介绍方案设计，长度同样足够。

#### 细节
这一节只作为正文结构保留，不单独生成正文配图。`,
      "AI 工作流",
    );

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.title)).toEqual(["背景", "方案"]);
  });

  it("falls back to intro or whole document when body headings are missing", () => {
    expect(
      buildArticleSections(
        `# AI 工作流

这是一段足够长的导语内容，应该作为核心内容抽取出来。`,
        "AI 工作流",
      ),
    ).toEqual([
      {
        level: 2,
        title: "核心内容",
        content: "这是一段足够长的导语内容，应该作为核心内容抽取出来。",
      },
    ]);

    expect(buildArticleSections("太短", "AI 工作流")).toEqual([
      {
        level: 2,
        title: "核心内容",
        content: "太短",
      },
    ]);
  });

  it("builds slides pictures from cover plus each level-two section", () => {
    const pictures = buildSlidesPictures(
      `# AI 工作流

开场导语。

## 背景
背景内容足够长，适合生成一页独立信息图。

## 方案
方案内容也足够长，适合另一页独立信息图。`,
      "AI 工作流",
    );

    expect(pictures).toHaveLength(3);
    expect(pictures[0].id).toBe(1);
    expect(pictures[0].topic).toBe("封面");
    expect(pictures[0].content).toContain("AI 工作流");
    expect(pictures.slice(1)).toEqual([
      {
        id: 2,
        topic: "背景",
        content: "背景内容足够长，适合生成一页独立信息图。",
      },
      {
        id: 3,
        topic: "方案",
        content: "方案内容也足够长，适合另一页独立信息图。",
      },
    ]);
  });

  it("falls back to a single core slide when headings are missing", () => {
    expect(buildSlidesPictures("只有一段足够长的正文内容，没有分节标题。", "主题")).toEqual([
      {
        id: 1,
        topic: "封面",
        content: "主题\n\n只有一段足够长的正文内容，没有分节标题。",
      },
      {
        id: 2,
        topic: "核心内容",
        content: "只有一段足够长的正文内容，没有分节标题。",
      },
    ]);
  });
});
