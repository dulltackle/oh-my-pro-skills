import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIOS,
  MODES,
  PLATFORMS,
  PROVIDERS,
  SIZES,
  STYLE_NAMES,
} from "../../lib/cli-metadata.js";
import { getStyleMetadata } from "../../lib/style-loader.js";

describe("cli-metadata", () => {
  it("exports the shared CLI choices", () => {
    expect(MODES).toEqual(["article", "slides", "cover"]);
    expect(PLATFORMS).toEqual([
      "youtube",
      "wechat",
      "twitter",
      "xiaohongshu",
      "landscape",
    ]);
    expect(PROVIDERS).toEqual(["tuzi", "tuzi-openai"]);
    expect(SIZES).toEqual(["default", "2k", "4k"]);
    expect(ASPECT_RATIOS).toContain("16:9");
    expect(ASPECT_RATIOS).toContain("21:9");
  });

  it("keeps style names aligned with the style index", () => {
    expect(STYLE_NAMES).toEqual(["light", "dark", "minimal", "bento", "cover"]);
    for (const styleName of STYLE_NAMES) {
      expect(ASPECT_RATIOS).toContain(getStyleMetadata(styleName).defaultAspectRatio);
    }
  });
});
