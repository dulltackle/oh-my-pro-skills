import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSmartArgs,
  resolveSmartOptions,
} from "../../lib/smart-options.js";

describe("smart-options", () => {
  it("uses current shared defaults", () => {
    const options = resolveSmartOptions(
      parseSmartArgs(["--mode", "cover", "--topic", "默认封面"]),
      process.cwd(),
    );

    expect(options.platform).toBe("wechat");
    expect(options.size).toBe("4k");
    expect(options.timeoutMs).toBe(600_000);
  });

  it("parses the explicit platform option", () => {
    const parsed = parseSmartArgs([
      "--mode",
      "cover",
      "--topic",
      "小红书封面",
      "--platform",
      "xiaohongshu",
    ]);

    expect(parsed.platform).toBe("xiaohongshu");
  });

  it("lets CLI platform override project config", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "smart-options-platform-"));
    const configDir = join(workDir, ".smart-illustrator");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({ platform: "youtube" }, null, 2),
    );

    const options = resolveSmartOptions(
      parseSmartArgs([
        "--mode",
        "cover",
        "--topic",
        "小红书封面",
        "--platform",
        "xiaohongshu",
      ]),
      workDir,
    );

    expect(options.platform).toBe("xiaohongshu");
  });
});
