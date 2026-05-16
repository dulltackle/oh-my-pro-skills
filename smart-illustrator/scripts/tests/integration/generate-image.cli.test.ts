import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TUZI_MODEL,
  DEFAULT_TUZI_OPENAI_MODEL,
} from "../../generate-image.js";
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

async function runCli(args: string[], env: Record<string, string>) {
  const entry = resolve(process.cwd(), "generate-image.ts");
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

describe("generate-image CLI integration (mock APIs)", () => {
  let server: MockApiServer;

  beforeEach(async () => {
    server = await startMockApiServer();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("supports provider tuzi/tuzi-openai with same prompt demand", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-"));
    const commonEnv = {
      TUZI_API_BASE: server.baseUrl,
      TUZI_OPENAI_API_BASE: server.baseUrl,
      TUZI_API_KEY: "tz-key",
    };

    for (const provider of ["tuzi", "tuzi-openai"] as const) {
      const output = join(workDir, `${provider}.png`);
      await runCli(
        [
          "--provider",
          provider,
          "--prompt",
          "same demand for all providers",
          "--output",
          output,
          "--size",
          "2k",
          "--aspect-ratio",
          "16:9",
        ],
        commonEnv,
      );
      expect(existsSync(output)).toBe(true);
      const content = await readFile(output);
      expect(content.length).toBeGreaterThan(0);
    }

    expect(server.requests.length).toBe(2);
  });

  it("supports --prompt-file and --candidates with sequential output names", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-"));
    const promptFile = join(workDir, "prompt.md");
    await writeFile(promptFile, "diagram style output");
    const output = join(workDir, "multi.png");

    await runCli(
      [
        "--provider",
        "tuzi",
        "--prompt-file",
        promptFile,
        "--output",
        output,
        "--candidates",
        "2",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(join(workDir, "multi-1.png"))).toBe(true);
    expect(existsSync(join(workDir, "multi-2.png"))).toBe(true);
  });

  it("reads shared config defaults for model/aspect-ratio/candidates/output-dir", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-config-"));
    const fakeHome = join(workDir, "home");
    const outputDir = join(fakeHome, ".smart-illustrator", "outputs");
    await mkdir(join(fakeHome, ".smart-illustrator"), { recursive: true });
    await writeFile(
      join(fakeHome, ".smart-illustrator", "config.json"),
      JSON.stringify(
        {
          provider: "tuzi",
          model: "configured-model",
          size: "2k",
          aspectRatio: "16:9",
          candidates: 2,
          outputDir: "outputs",
        },
        null,
        2,
      ),
    );

    await runCli(
      ["--prompt", "config driven output"],
      {
        HOME: fakeHome,
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(join(outputDir, "generated-1.png"))).toBe(true);
    expect(existsSync(join(outputDir, "generated-2.png"))).toBe(true);
    expect(server.requests[0].path).toContain("/configured-model:generateContent");
    const configBody = server.requests[0].body as {
      generationConfig: { imageConfig: { imageSize: string; aspectRatio: string } };
    };
    expect(configBody.generationConfig.imageConfig).toEqual({
      imageSize: "2K",
      aspectRatio: "16:9",
    });
  });

  it("passes size/aspect-ratio and provider-specific auth style", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-"));
    const output = join(workDir, "auth.png");

    await runCli(
      [
        "--provider",
        "tuzi",
        "--prompt",
        "auth probe",
        "--output",
        output,
        "--size",
        "2k",
        "--aspect-ratio",
        "16:9",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const req = server.requests[0];
    expect(req.headers.authorization).toBe("Bearer tz-key");
    const body = req.body as {
      generationConfig: { imageConfig: { imageSize: string; aspectRatio: string } };
    };
    expect(body.generationConfig.imageConfig).toEqual({
      imageSize: "2K",
      aspectRatio: "16:9",
    });
  });

  it("contains help text guardrails for Tuzi usage", async () => {
    const entry = resolve(process.cwd(), "generate-image.ts");
    const { stdout } = await execFileAsync(
      "node",
      ["--import", "tsx", entry, "--help"],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain("tuzi");
    expect(stdout).toContain("TUZI_API_KEY");
    expect(stdout).toContain("TUZI_OPENAI_API_BASE");
    expect(stdout).toContain(DEFAULT_TUZI_MODEL);
    expect(stdout).toContain(DEFAULT_TUZI_MODEL);
    expect(stdout).toContain(DEFAULT_TUZI_OPENAI_MODEL);
    expect(stdout).not.toContain("--varied");
    expect(stdout).not.toContain("--learn-cover");
    expect(stdout).not.toContain("--learn-note");
    expect(stdout).not.toContain("--show-learnings");
    expect(stdout).not.toContain("--ref-weight");
  });

  it("fails fast with a migration hint when --varied is used", async () => {
    const error = await runCliExpectFailure(
      ["--varied", "--prompt", "youtube cover prompt", "--output", "ignored.png"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    expect(error.code).toBe(1);
    expect(output).toContain("--varied has been removed");
    expect(output).toContain("--candidates 2");
  });

  it("fails fast with a migration hint when --ref-weight is used", async () => {
    const error = await runCliExpectFailure(
      ["--ref-weight", "0.5", "--prompt", "style lock", "--output", "ignored.png"],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    expect(error.code).toBe(1);
    expect(output).toContain("--ref-weight 已移除");
    expect(output).toContain("参考图权重不支持配置");
  });

  it("retries transient provider failures for single-image generation", async () => {
    await server.close();
    server = await startFlakyApiServer();

    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-retry-"));
    const output = join(workDir, "retry.png");
    const { stdout } = await runCli(
      [
        "--provider",
        "tuzi",
        "--prompt",
        "retry this image",
        "--output",
        output,
        "--backoff-base",
        "1",
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(output)).toBe(true);
    expect(server.requests).toHaveLength(2);
    expect(stdout).toContain("Retry 1/1");
    expect(stdout).toContain("Retried 1 time(s)");
  });

  it("uses Tuzi OpenAI edits endpoint when reference images are provided", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-"));
    const ref = join(workDir, "ref.png");
    const output = join(workDir, "tuzi-openai-ref.png");
    await writeFile(
      ref,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x1x8AAAAASUVORK5CYII=",
        "base64",
      ),
    );

    await runCli(
      [
        "--provider",
        "tuzi-openai",
        "--prompt",
        "style lock through OpenAI edits",
        "--ref",
        ref,
        "--output",
        output,
      ],
      {
        TUZI_OPENAI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(output)).toBe(true);
    expect(server.requests[0].path).toBe("/images/edits");
    expect(server.requests[0].headers.authorization).toBe("Bearer tz-key");
    expect(server.requests[0].headers["content-type"]).toContain(
      "multipart/form-data",
    );
  });

  it("fails on missing --ref by default and can ignore it explicitly", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-ref-"));
    const missingRef = join(workDir, "missing.png");
    const failedOutput = join(workDir, "failed.png");

    const error = await runCliExpectFailure(
      [
        "--provider",
        "tuzi",
        "--prompt",
        "missing ref should fail",
        "--ref",
        missingRef,
        "--output",
        failedOutput,
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    const failedText = `${error.stdout || ""}\n${error.stderr || ""}`;
    expect(error.code).toBe(1);
    expect(failedText).toContain(missingRef);
    expect(failedText).toContain("--ignore-missing-ref");

    const ignoredOutput = join(workDir, "ignored.png");
    await runCli(
      [
        "--provider",
        "tuzi",
        "--prompt",
        "missing ref can be ignored",
        "--ref",
        missingRef,
        "--ignore-missing-ref",
        "--output",
        ignoredOutput,
      ],
      {
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(ignoredOutput)).toBe(true);
  });

  it("does not append removed cover learning text for cover-like prompts", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-illustrator-cli-"));
    const fakeHome = join(workDir, "home");
    const output = join(workDir, "cover.png");
    await mkdir(join(fakeHome, ".smart-illustrator"), { recursive: true });
    await writeFile(
      join(fakeHome, ".smart-illustrator", "cover-learnings.md"),
      "# stale learnings\n\n## 提炼的模式（自动汇总）\n\n### 高 CTR 共性\n- 不应被注入\n",
    );

    await runCli(
      [
        "--provider",
        "tuzi",
        "--prompt",
        "youtube cover prompt",
        "--output",
        output,
      ],
      {
        HOME: fakeHome,
        TUZI_API_BASE: server.baseUrl,
        TUZI_API_KEY: "tz-key",
      },
    );

    expect(existsSync(output)).toBe(true);
    const body = server.requests[0].body as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.contents[0].parts).toEqual([
      { text: "youtube cover prompt" },
    ]);
  });
});
