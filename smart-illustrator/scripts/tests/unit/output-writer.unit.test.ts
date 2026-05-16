import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveBaseName,
  renderArticleMarkdown,
  sanitizeFilename,
  writePromptBundle,
} from "../../lib/output-writer.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("output-writer", () => {
  it("sanitizes filenames and derives base names", () => {
    expect(sanitizeFilename('  AI / Workflow: Intro?  ')).toBe("AI-Workflow-Intro");
    expect(sanitizeFilename("   ")).toBe("smart-illustrator");
    expect(deriveBaseName("/tmp/post.md", "忽略此值")).toBe("post");
    expect(deriveBaseName(null, "封面主题")).toBe("封面主题");
    expect(deriveBaseName(null, null)).toBe("cover");
  });

  it("writes prompt bundles with a trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "smart-illustrator-output-"));
    tempDirs.push(dir);
    const outputPath = join(dir, "nested", "bundle.json");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await writePromptBundle(outputPath, { hello: "world" });
      expect(logSpy).toHaveBeenCalledWith(`Saved prompt bundle: ${outputPath}`);
    } finally {
      logSpy.mockRestore();
    }

    await expect(readFile(outputPath, "utf-8")).resolves.toBe(
      '{\n  "hello": "world"\n}\n',
    );
  });

  it("renders article markdown with cover and section images", () => {
    const rendered = renderArticleMarkdown(
      "# 主标题\n\n开场。\n\n## 第一节\n内容一\n\n## 第二节\n内容二",
      "cover.png",
      ["a.png", "b.png"],
    );

    expect(rendered).toContain("# 主标题\n\n![封面](cover.png)\n");
    expect(rendered).toContain("\n![配图](a.png)\n\n## 第一节");
    expect(rendered).toContain("\n![配图](b.png)\n\n## 第二节");
  });

  it("renders section images before level-two and level-three headings only", () => {
    const rendered = renderArticleMarkdown(
      "# 主标题\n\n导语。\n\n### 第一节\n内容一\n\n#### 第二节\n内容二",
      "cover.png",
      ["a.png", "b.png"],
    );

    expect(rendered).toContain("\n![配图](a.png)\n\n### 第一节");
    expect(rendered).not.toContain("\n![配图](b.png)\n\n#### 第二节");
    expect(rendered).toContain("\n\n#### 第二节\n内容二");
  });

  it("ignores heading-like lines inside backtick fences when inserting section images", () => {
    const rendered = renderArticleMarkdown(
      "# 主标题\n\n```md\n## fake heading\n示例内容\n```\n\n## 真标题\n真实内容",
      "cover.png",
      ["a.png"],
    );

    expect(rendered).toContain("```md\n## fake heading\n示例内容\n```");
    expect(rendered).not.toContain("![配图](a.png)\n\n## fake heading");
    expect(rendered).toContain("![配图](a.png)\n\n## 真标题");
  });

  it("ignores heading-like lines inside tilde fences when inserting the cover", () => {
    const rendered = renderArticleMarkdown(
      `~~~markdown
# fake title
~~~

# 真标题

正文`,
      "cover.png",
      [],
    );

    expect(rendered).toContain("~~~markdown\n# fake title\n~~~");
    expect(rendered).not.toContain("~~~markdown\n# fake title\n\n![封面](cover.png)");
    expect(rendered).toContain("# 真标题\n\n![封面](cover.png)\n");
  });

  it("consumes section images only for real level-two and level-three headings around fenced blocks", () => {
    const rendered = renderArticleMarkdown(
      `# 主标题

### 第一节
内容一

\`\`\`md
#### fake detail
\`\`\`

#### 第二节
内容二

~~~markdown
## fake section
~~~

## 第三节
内容三`,
      "cover.png",
      ["a.png", "b.png", "c.png"],
    );

    expect(rendered).toContain("![配图](a.png)\n\n### 第一节");
    expect(rendered).not.toContain("![配图](b.png)\n\n#### 第二节");
    expect(rendered).toContain("![配图](b.png)\n\n## 第三节");
    expect(rendered).not.toContain("![配图](b.png)\n\n#### fake detail");
    expect(rendered).not.toContain("![配图](c.png)\n\n## fake section");
  });

  it("falls back when article headings are missing", () => {
    expect(
      renderArticleMarkdown("只有正文，没有标题。", "cover.png", ["body.png"]),
    ).toBe("![封面](cover.png)\n\n只有正文，没有标题。\n\n![配图](body.png)\n");

    expect(
      renderArticleMarkdown("# 主标题\n\n只有一段正文。", null, ["body.png"]),
    ).toBe("# 主标题\n\n只有一段正文。\n\n![配图](body.png)\n");
  });
});
