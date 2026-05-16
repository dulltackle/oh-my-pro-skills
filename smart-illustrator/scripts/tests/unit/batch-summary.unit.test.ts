import { describe, expect, it } from "vitest";
import {
  buildBatchSummary,
  buildRetryCommand,
} from "../../lib/batch-summary.js";

describe("batch-summary", () => {
  it("builds retry commands with generation options", () => {
    const command = buildRetryCommand(
      "/tmp/deck slides.json",
      "/tmp/out dir",
      "gemini",
      "default",
      "16:9",
      ["/tmp/ref one.png"],
      true,
      0,
      45_000,
      1,
      1_200,
      [2, 4],
    );

    expect(command).toContain("batch-generate.ts");
    expect(command).toContain("--config '/tmp/deck slides.json'");
    expect(command).toContain("--output-dir '/tmp/out dir'");
    expect(command).toContain("--provider gemini");
    expect(command).toContain("--size default");
    expect(command).toContain("--aspect-ratio 16:9");
    expect(command).toContain("--ref '/tmp/ref one.png'");
    expect(command).toContain("--ignore-missing-ref");
    expect(command).toContain("--regenerate 2,4");
  });

  it("builds summary counts and reference metadata", () => {
    const summary = buildBatchSummary({
      configPath: "/tmp/config.json",
      outputDir: "/tmp/images",
      summaryPath: "/tmp/images/config.summary.json",
      provider: "tuzi",
      model: "nano-banana-2",
      size: "2k",
      aspectRatio: "1:1",
      refPaths: ["/tmp/ref.png"],
      referenceCount: 1,
      prefix: "config",
      total: 2,
      generated: 1,
      skipped: 0,
      failed: 1,
      retried: 2,
      items: [
        {
          id: 1,
          topic: "Cover",
          filename: "config-01.png",
          outputPath: "/tmp/images/config-01.png",
          status: "generated",
          retryCount: 0,
        },
      ],
    });

    expect(summary).toMatchObject({
      configPath: "/tmp/config.json",
      outputDir: "/tmp/images",
      provider: "tuzi",
      size: "2k",
      aspectRatio: "1:1",
      references: {
        count: 1,
        paths: ["/tmp/ref.png"],
      },
      counts: {
        generated: 1,
        skipped: 0,
        failed: 1,
        retried: 2,
      },
    });
    expect(summary.generatedAt).toEqual(expect.any(String));
  });
});
