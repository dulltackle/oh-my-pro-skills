import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startFlakyApiServer,
  startMockApiServer,
  type MockApiServer,
} from "../helpers/mock-api.js";

const execFileAsync = promisify(execFile);
type CliFailure = NodeJS.ErrnoException & {
  code?: number;
  stdout?: string;
  stderr?: string;
};

async function runCli(
  args: string[],
  env: Record<string, string> = {},
  cwd: string = process.cwd(),
) {
  const entry = resolve(process.cwd(), "smart-illustrator.ts");
  const tsxLoader = resolve(process.cwd(), "node_modules/tsx/dist/loader.mjs");
  return execFileAsync("node", ["--import", tsxLoader, entry, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function runCliExpectFailure(
  args: string[],
  env: Record<string, string> = {},
  cwd?: string,
) {
  try {
    await runCli(args, env, cwd);
    throw new Error("Expected CLI to fail");
  } catch (error) {
    return error as CliFailure;
  }
}

describe("smart-illustrator CLI integration", () => {
  let server: MockApiServer;

  beforeEach(async () => {
    server = await startMockApiServer();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("fails fast when cover mode has neither input nor topic", async () => {
    const error = await runCliExpectFailure(["--mode", "cover"]);
    expect(error.code).toBe(1);
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
      "cover 模式在无输入文件时必须提供 --topic",
    );
  });

  it("writes unified slides JSON in prompt-only mode", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-slides-"));
    const inputPath = join(workDir, "deck.md");
    await writeFile(
      inputPath,
      `# Agent 工作流

## 背景
多模型协作需要统一抽象和清晰边界。

## 方法
按阶段拆任务，每页一张图，避免多主题混排。`,
    );

    await runCli([inputPath, "--mode", "slides", "--prompt-only"]);

    const configPath = join(workDir, "deck-slides.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.batch_rules).toMatchObject({
      one_item_one_image: true,
      do_not_merge: true,
      aspect_ratio: "16:9",
    });
    expect(config.pictures).toHaveLength(3);
    expect(config.pictures[0].topic).toBe("封面");
    expect(config.pictures[1].topic).toBe("背景");
  });

  it("uses explicit platform for cover prompt-only output", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cover-platform-"));

    await runCli([
      "--mode",
      "cover",
      "--topic",
      "小红书封面",
      "--platform",
      "xiaohongshu",
      "--prompt-only",
      "--output-dir",
      workDir,
    ]);

    const configPath = join(workDir, "小红书封面-cover-prompt.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.platform).toBe("xiaohongshu");
    expect(config.aspectRatio).toBe("3:4");
    expect(config.prompt).toContain("平台：xiaohongshu");
    expect(config.prompt).toContain("目标宽高比：3:4");
  });

  it("rejects a style that is not available for the selected mode", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-style-mode-"));
    const inputPath = join(workDir, "deck.md");
    await writeFile(
      inputPath,
      `# Deck

## One
Slides should not use a cover-only style.`,
    );

    const error = await runCliExpectFailure([
      inputPath,
      "--mode",
      "slides",
      "--style",
      "cover",
      "--prompt-only",
    ]);

    expect(error.code).toBe(1);
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
      "style cover 不支持 slides 模式",
    );
  });

  it("generates article cover, body images, and a sidecar markdown", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-article-"));
    const inputPath = join(workDir, "article.md");
    await writeFile(
      inputPath,
      `# Agent Skills

这是一篇关于技能编排的文章导语。

## 渐进式披露
只在真正需要时加载完整上下文，避免无意义地占满 token。

## 路由精度
让 description 对触发条件保持高分辨率，减少误触发。`,
    );

    await runCli([inputPath], {
      GEMINI_API_BASE: server.baseUrl,
      GEMINI_API_KEY: "gm-key",
    });

    expect(existsSync(join(workDir, "article-cover.png"))).toBe(true);
    expect(existsSync(join(workDir, "article-image-01.png"))).toBe(true);
    expect(existsSync(join(workDir, "article-image-02.png"))).toBe(true);
    expect(existsSync(join(workDir, "article-image.md"))).toBe(true);

    const outputMarkdown = await readFile(join(workDir, "article-image.md"), "utf-8");
    expect(outputMarkdown).toContain("![封面](article-cover.png)");
    expect(outputMarkdown).toContain("![配图](article-image-01.png)");
    expect(server.requests).toHaveLength(3);
  });

  it("inserts body images for level-three headings in article mode", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-article-deep-"));
    const inputPath = join(workDir, "deep.md");
    await writeFile(
      inputPath,
      `# 深层章节文章

导语。

### 第一节
这一节内容足够长，可以稳定生成第一张正文图。

### 第二节
这一节内容同样足够长，可以稳定生成第二张正文图。`,
    );

    await runCli([inputPath], {
      GEMINI_API_BASE: server.baseUrl,
      GEMINI_API_KEY: "gm-key",
    });

    const outputMarkdown = await readFile(join(workDir, "deep-image.md"), "utf-8");
    const sectionRefs =
      outputMarkdown.match(/!\[配图\]\(deep-image-\d{2}\.png\)/g) ?? [];

    expect(existsSync(join(workDir, "deep-image-01.png"))).toBe(true);
    expect(existsSync(join(workDir, "deep-image-02.png"))).toBe(true);
    expect(sectionRefs).toHaveLength(2);
    expect(outputMarkdown).toContain("![配图](deep-image-01.png)\n\n### 第一节");
    expect(outputMarkdown).toContain("![配图](deep-image-02.png)\n\n### 第二节");
  });

  it("fails on missing --ref by default and can ignore it explicitly", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-ref-"));
    const inputPath = join(workDir, "article.md");
    const missingRef = join(workDir, "missing.png");
    await writeFile(inputPath, "# 参考图测试\n\n这是一段足够长的正文内容。");

    const error = await runCliExpectFailure(
      [
        inputPath,
        "--mode",
        "cover",
        "--provider",
        "gemini",
        "--ref",
        missingRef,
      ],
      {
        GEMINI_API_BASE: server.baseUrl,
        GEMINI_API_KEY: "gm-key",
      },
      workDir,
    );

    const failedText = `${error.stdout || ""}\n${error.stderr || ""}`;
    expect(error.code).toBe(1);
    expect(failedText).toContain(missingRef);
    expect(failedText).toContain("--ignore-missing-ref");

    await runCli(
      [
        inputPath,
        "--mode",
        "cover",
        "--provider",
        "gemini",
        "--ref",
        missingRef,
        "--ignore-missing-ref",
      ],
      {
        GEMINI_API_BASE: server.baseUrl,
        GEMINI_API_KEY: "gm-key",
      },
      workDir,
    );

    expect(existsSync(join(workDir, "article-cover.png"))).toBe(true);
  });

  it("reads shared project config for provider/model/candidates/output-dir", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-config-"));
    const outputDir = join(workDir, "configured-output");
    const configDir = join(workDir, ".smart-illustrator");
    const refPath = join(workDir, "ref.png");

    await mkdir(configDir, { recursive: true });
    await writeFile(
      refPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x1x8AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await writeFile(
      join(workDir, "article.md"),
      `# 配置驱动封面

这是一段用于覆盖配置读取逻辑的测试正文。`,
    );
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          provider: "gemini",
          model: "configured-model",
          size: "default",
          candidates: 2,
          outputDir: "configured-output",
          references: ["ref.png"],
        },
        null,
        2,
      ),
    );

    await runCli(
      ["article.md", "--mode", "cover"],
      {
        GEMINI_API_BASE: server.baseUrl,
        GEMINI_API_KEY: "gm-key",
      },
      workDir,
    );

    expect(existsSync(join(outputDir, "article-cover-1.png"))).toBe(true);
    expect(existsSync(join(outputDir, "article-cover-2.png"))).toBe(true);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].path).toContain("/configured-model:generateContent?key=gm-key");
    const firstBody = server.requests[0].body as {
      generationConfig: { responseModalities: string[] };
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(firstBody.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(
      firstBody.contents[0].parts.some(
        (part: Record<string, unknown>) => "inlineData" in part,
      ),
    ).toBe(true);
  });

  it("retries transient provider failures in the unified entrypoint", async () => {
    await server.close();
    server = await startFlakyApiServer();

    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-retry-"));
    const { stdout } = await runCli(
      [
        "--mode",
        "cover",
        "--topic",
        "Retry Cover",
        "--provider",
        "gemini",
        "--output-dir",
        workDir,
        "--backoff-base",
        "1",
      ],
      {
        GEMINI_API_BASE: server.baseUrl,
        GEMINI_API_KEY: "gm-key",
      },
    );

    expect(existsSync(join(workDir, "Retry-Cover-cover.png"))).toBe(true);
    expect(server.requests).toHaveLength(2);
    expect(stdout).toContain("Retry 1/1");
    expect(stdout).toContain("Retried 1 time(s)");
  });

  it("does not retry when --max-retries is 0", async () => {
    await server.close();
    server = await startFlakyApiServer();

    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-no-retry-"));
    const error = await runCliExpectFailure(
      [
        "--mode",
        "cover",
        "--topic",
        "No Retry",
        "--provider",
        "gemini",
        "--output-dir",
        workDir,
        "--max-retries",
        "0",
      ],
      {
        GEMINI_API_BASE: server.baseUrl,
        GEMINI_API_KEY: "gm-key",
      },
    );

    expect(error.code).toBe(1);
    expect(server.requests).toHaveLength(1);
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
      "HTTP 503",
    );
  });

  it("validates unknown, missing, and invalid arguments consistently", async () => {
    const unknown = await runCliExpectFailure(["--unknown"]);
    expect(unknown.code).toBe(1);
    expect(`${unknown.stderr || ""}${unknown.stdout || ""}`).toContain(
      "未知参数：--unknown",
    );

    const missing = await runCliExpectFailure(["--mode"]);
    expect(missing.code).toBe(1);
    expect(`${missing.stderr || ""}${missing.stdout || ""}`).toContain(
      "--mode 缺少参数值",
    );

    const invalid = await runCliExpectFailure(["--provider", "bad"]);
    expect(invalid.code).toBe(1);
    expect(`${invalid.stderr || ""}${invalid.stdout || ""}`).toContain(
      "--provider 不支持：bad",
    );
  });
});
