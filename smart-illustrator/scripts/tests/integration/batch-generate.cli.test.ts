import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startMockApiServer, type MockApiServer } from "../helpers/mock-api.js";

const execFileAsync = promisify(execFile);
type CliFailure = NodeJS.ErrnoException & {
  code?: number;
  stdout?: string;
  stderr?: string;
};

interface UnifiedConfigInput {
  style?: unknown;
  pictures?: unknown;
  instruction?: unknown;
  batch_rules?: unknown;
  fallback?: unknown;
  illustrations?: unknown;
}

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x1x8AAAAASUVORK5CYII=";

async function runCli(args: string[], env: Record<string, string>) {
  const entry = resolve(process.cwd(), "batch-generate.ts");
  return execFileAsync(
    "node",
    ["--import", "tsx", entry, ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
    },
  );
}

async function runCliExpectFailure(args: string[], env: Record<string, string>) {
  try {
    await runCli(args, env);
    throw new Error("Expected CLI to fail");
  } catch (error) {
    return error as CliFailure;
  }
}

function createUnifiedConfig(overrides: UnifiedConfigInput = {}) {
  return {
    style: "Simple infographic style",
    pictures: [
      { id: 1, topic: "Cover", content: "Intro content" },
      { id: 2, topic: "Flow", content: "Body content" },
    ],
    ...overrides,
  };
}

async function startPartialFailureServer(): Promise<MockApiServer> {
  const requests: MockApiServer["requests"] = [];
  let requestCount = 0;
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }

      const raw = Buffer.concat(chunks).toString("utf-8") || "{}";
      requests.push({
        method: req.method,
        path: req.url || "/",
        headers: req.headers,
        body: JSON.parse(raw),
      });

      requestCount += 1;
      const isOpenai = (req.url || "").includes("/images/");

      if (requestCount === 2) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            isOpenai
              ? { data: [{ text: "no image returned" }] }
              : {
                  candidates: [
                    { content: { parts: [{ text: "no image returned" }] } },
                  ],
                },
          ),
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          isOpenai
            ? { data: [{ b64_json: PNG_BASE64 }], output_format: "png" }
            : {
                candidates: [
                  {
                    content: {
                      parts: [
                        { inlineData: { mimeType: "image/png", data: PNG_BASE64 } },
                      ],
                    },
                  },
                ],
              },
        ),
      );
    },
  );

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to get mock server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

describe("batch-generate CLI integration", () => {
  let server: MockApiServer;

  beforeEach(async () => {
    server = await startMockApiServer();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("generates images from the unified config format", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "deck-slides.json");
    const outputDir = join(workDir, "images");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );

    const { stdout } = await runCli(
      ["--config", configPath, "--output-dir", outputDir, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(stdout).toContain("Batch Image Generation");
    expect(stdout).toContain("Complete: 2/2 succeeded, 0 failed");
    expect(stdout).toContain(`Summary file: ${join(outputDir, "deck.summary.json")}`);
    expect(existsSync(join(outputDir, "deck-01.png"))).toBe(true);
    expect(existsSync(join(outputDir, "deck-02.png"))).toBe(true);
    expect(existsSync(join(outputDir, "deck.summary.json"))).toBe(true);
    expect(server.requests).toHaveLength(2);

    const summary = JSON.parse(
      await readFile(join(outputDir, "deck.summary.json"), "utf-8"),
    ) as {
      counts: { generated: number; skipped: number; failed: number; retried: number };
      items: Array<{ status: string; outputPath: string; retryCount: number }>;
      summaryPath: string;
      size: string;
      aspectRatio?: string;
      references: { count: number; paths: string[] };
      total: number;
    };
    expect(summary.total).toBe(2);
    expect(summary.summaryPath).toBe(join(outputDir, "deck.summary.json"));
    expect(summary.size).toBe("2k");
    expect(summary.references).toEqual({ count: 0, paths: [] });
    expect(summary.counts).toEqual({
      generated: 2,
      skipped: 0,
      failed: 0,
      retried: 0,
    });
    expect(summary.items).toHaveLength(2);
    expect(summary.items.every((item) => item.status === "generated")).toBe(true);
    expect(summary.items.every((item) => item.retryCount === 0)).toBe(true);
    expect(summary.items[0].outputPath).toBe(join(outputDir, "deck-01.png"));
  });

  it("keeps resume, targeted regenerate, and force behavior for unified configs", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "resume-slides.json");
    const outputDir = join(workDir, "images");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );

    const env = {
      TUZI_API_BASE: server.baseUrl,
      TUZI_OPENAI_API_BASE: server.baseUrl,
      TUZI_API_KEY: "tz-key",
    };

    await runCli(
      ["--config", configPath, "--output-dir", outputDir, "--delay", "0"],
      env,
    );
    expect(server.requests).toHaveLength(2);

    const resumeRun = await runCli(
      ["--config", configPath, "--output-dir", outputDir, "--delay", "0"],
      env,
    );
    expect(resumeRun.stdout).toContain("Mode: Resume (skip existing)");
    expect(resumeRun.stdout).toContain("Skipping: resume-01.png (already exists)");
    expect(resumeRun.stdout).toContain("Complete: 0 generated, 2 skipped, 0 failed");
    expect(server.requests).toHaveLength(2);

    const regenerateRun = await runCli(
      [
        "--config",
        configPath,
        "--output-dir",
        outputDir,
        "--delay",
        "0",
        "--regenerate",
        "2",
      ],
      env,
    );
    expect(regenerateRun.stdout).toContain("Mode: Regenerate specific IDs: 2");
    expect(regenerateRun.stdout).toContain("(Regenerating as requested)");
    expect(server.requests).toHaveLength(3);

    const forceRun = await runCli(
      [
        "--config",
        configPath,
        "--output-dir",
        outputDir,
        "--delay",
        "0",
        "--force",
      ],
      env,
    );
    expect(forceRun.stdout).toContain("Mode: Force regenerate all");
    expect(server.requests).toHaveLength(5);
  });

  it("accepts explicit provider, size, aspect ratio, and reference images", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "refs-slides.json");
    const refPath = join(workDir, "style.png");
    const outputDir = join(workDir, "images");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );
    await writeFile(refPath, Buffer.from(PNG_BASE64, "base64"));

    const { stdout } = await runCli(
      [
        "--config",
        configPath,
        "--output-dir",
        outputDir,
        "--provider",
        "tuzi",
        "--size",
        "default",
        "--aspect-ratio",
        "1:1",
        "--ref",
        refPath,
        "--delay",
        "0",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(stdout).toContain("Provider: tuzi");
    expect(stdout).toContain("Size: default");
    expect(stdout).toContain("Aspect ratio: 1:1");
    expect(stdout).toContain("Reference images: 1");
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].path).toContain(":generateContent");

    const body = server.requests[0].body as {
      generationConfig: { imageConfig: { aspectRatio: string } };
      contents: Array<{ parts: Array<{ inline_data?: { mime_type: string; data: string } }> }>;
    };
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "1:1" });
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: "image/png",
      data: PNG_BASE64,
    });

    const summary = JSON.parse(
      await readFile(join(outputDir, "refs.summary.json"), "utf-8"),
    ) as {
      provider: string;
      size: string;
      aspectRatio: string;
      references: { count: number; paths: string[] };
    };
    expect(summary.provider).toBe("tuzi");
    expect(summary.size).toBe("default");
    expect(summary.aspectRatio).toBe("1:1");
    expect(summary.references).toEqual({
      count: 1,
      paths: [refPath],
    });
  });

  it("fails when batch reference images cannot be loaded", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "missing-ref.json");
    const missingRefPath = join(workDir, "missing.png");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );

    const error = await runCliExpectFailure(
      [
        "--config",
        configPath,
        "--provider",
        "tuzi",
        "--ref",
        missingRefPath,
        "--delay",
        "0",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(error.code).toBe(1);
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
      "加载参考图失败",
    );
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
      missingRefPath,
    );
  });

  it("fails fast with a migration message for legacy configs", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "legacy.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          style: { mode: "light" },
          illustrations: [
            { id: 1, prompt: "legacy prompt", filename: "legacy-01.png" },
          ],
        },
        null,
        2,
      ),
    );

    const error = await runCliExpectFailure(
      ["--config", configPath, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    expect(error.code).toBe(1);
    expect(output).toContain("旧版批量配置已移除");
    expect(output).toContain("改用 `pictures`");
  });

  it("fails when style is missing or invalid", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "missing-style.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          pictures: [{ id: 1, topic: "Topic", content: "Content" }],
        },
        null,
        2,
      ),
    );

    const error = await runCliExpectFailure(
      ["--config", configPath, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(error.code).toBe(1);
    expect(`${error.stderr || ""}${error.stdout || ""}`).toContain("`style` 必须是非空字符串");
  });

  it("fails when pictures is missing or empty", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const missingPicturesPath = join(workDir, "missing-pictures.json");
    const emptyPicturesPath = join(workDir, "empty-pictures.json");

    await writeFile(
      missingPicturesPath,
      JSON.stringify({ style: "Style only" }, null, 2),
    );
    await writeFile(
      emptyPicturesPath,
      JSON.stringify({ style: "Style only", pictures: [] }, null, 2),
    );

    const missingError = await runCliExpectFailure(
      ["--config", missingPicturesPath, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );
    expect(missingError.code).toBe(1);
    expect(`${missingError.stderr || ""}${missingError.stdout || ""}`).toContain(
      "`pictures` 必须是数组",
    );

    const emptyError = await runCliExpectFailure(
      ["--config", emptyPicturesPath, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );
    expect(emptyError.code).toBe(1);
    expect(`${emptyError.stderr || ""}${emptyError.stdout || ""}`).toContain(
      "`pictures` 不能为空数组",
    );
  });

  it("validates unknown arguments and missing option values", async () => {
    const unknown = await runCliExpectFailure(["--unknown"], {});
    expect(unknown.code).toBe(1);
    expect(`${unknown.stderr || ""}${unknown.stdout || ""}`).toContain(
      "未知参数：--unknown",
    );

    const missing = await runCliExpectFailure(["--config"], {});
    expect(missing.code).toBe(1);
    expect(`${missing.stderr || ""}${missing.stdout || ""}`).toContain(
      "--config / -c 缺少参数值",
    );
  });

  it("rejects invalid --regenerate values and unknown ids", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "regenerate.json");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );

    for (const args of [
      ["--regenerate", "abc"],
      ["--regenerate", "1,,2"],
      ["--regenerate", "0"],
      ["--regenerate=-1"],
      ["--regenerate", "1.5"],
    ]) {
      const error = await runCliExpectFailure(
        ["--config", configPath, "--delay", "0", ...args],
        {
          TUZI_API_BASE: server.baseUrl,
          TUZI_OPENAI_API_BASE: server.baseUrl,
          TUZI_API_KEY: "tz-key",
        },
      );

      expect(error.code).toBe(1);
      expect(`${error.stderr || ""}${error.stdout || ""}`).toContain(
        "--regenerate 只支持正整数列表",
      );
    }

    const missingIdError = await runCliExpectFailure(
      ["--config", configPath, "--delay", "0", "--regenerate", "3"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(missingIdError.code).toBe(1);
    expect(`${missingIdError.stderr || ""}${missingIdError.stdout || ""}`).toContain(
      "--regenerate 包含不存在的图片 id: 3",
    );
  });

  it("reports the first invalid picture entry with index and id context", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "invalid-picture.json");
    await writeFile(
      configPath,
      JSON.stringify(
        createUnifiedConfig({
          pictures: [
            { id: 7, topic: 123, content: "Content" },
          ],
        }),
        null,
        2,
      ),
    );

    const error = await runCliExpectFailure(
      ["--config", configPath, "--delay", "0"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const output = `${error.stderr || ""}${error.stdout || ""}`;
    expect(error.code).toBe(1);
    expect(output).toContain("pictures[0] (id=7).topic");
    expect(output).toContain("必须是字符串");
  });

  it("writes failure details to the summary and prints a retry command", async () => {
    await server.close();
    server = await startPartialFailureServer();

    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-batch-"));
    const configPath = join(workDir, "failure-case-slides.json");
    const outputDir = join(workDir, "images");
    await writeFile(
      configPath,
      JSON.stringify(createUnifiedConfig(), null, 2),
    );

    const { stdout } = await runCli(
      [
        "--config",
        configPath,
        "--output-dir",
        outputDir,
        "--delay",
        "0",
        "--max-retries",
        "0",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(stdout).toContain("Complete: 1/2 succeeded, 1 failed");
    expect(stdout).toContain("Failed items:");
    expect(stdout).toContain("- [2] Flow: Tuzi OpenAI API did not return an image.");
    expect(stdout).toContain("Retry command:");
    expect(stdout).toContain("--regenerate 2");

    const summary = JSON.parse(
      await readFile(join(outputDir, "failure-case.summary.json"), "utf-8"),
    ) as {
      counts: { generated: number; skipped: number; failed: number; retried: number };
      items: Array<{ id: number; status: string; error?: string; retryCount: number }>;
    };

    expect(summary.counts).toEqual({ generated: 1, skipped: 0, failed: 1, retried: 0 });
    expect(summary.items).toEqual([
      expect.objectContaining({ id: 1, status: "generated", retryCount: 0 }),
      expect.objectContaining({
        id: 2,
        status: "failed",
        error: "Tuzi OpenAI API did not return an image.",
        retryCount: 0,
      }),
    ]);
  });
});
