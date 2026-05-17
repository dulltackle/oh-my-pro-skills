import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STYLE_NAMES } from "../../lib/cli-types.js";
import {
  getStyleMetadata,
  readStylePrompt,
  resolveStyleName,
} from "../../lib/style-loader.js";

const stylesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../styles",
);

describe("style-loader", () => {
  it("reads metadata from the shared style index", () => {
    expect(STYLE_NAMES).toEqual(["light", "dark", "minimal", "bento", "cover"]);
    expect(getStyleMetadata("light")).toMatchObject({
      file: "style-light.md",
      targets: ["article", "slides", "cover"],
      defaultAspectRatio: "16:9",
    });
    expect(getStyleMetadata("cover")).toMatchObject({
      file: "style-cover.md",
      targets: ["article", "cover"],
      defaultAspectRatio: "16:9",
    });
  });

  it("loads the prompt file defined by the style index", async () => {
    const expected = await readFile(join(stylesDir, "style-dark.md"), "utf-8");
    await expect(readStylePrompt("dark")).resolves.toBe(expected);
  });

  it("keeps default style resolution behavior for body and cover targets", () => {
    expect(resolveStyleName("article", null, "body")).toBe("light");
    expect(resolveStyleName("slides", null, "body")).toBe("light");
    expect(resolveStyleName("article", null, "cover")).toBe("light");
    expect(resolveStyleName("cover", null, "cover")).toBe("light");
    expect(resolveStyleName("cover", "dark", "cover")).toBe("dark");
  });

  it("rejects explicitly requested styles that do not support the current mode", () => {
    expect(() => resolveStyleName("slides", "cover", "body")).toThrow(
      "style cover 不支持 slides 模式，可用 style：light / dark / minimal / bento",
    );
  });
});
