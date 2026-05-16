import styleIndex from "../../styles/index.json" with { type: "json" };

export const MODES = ["article", "slides", "cover"] as const;
export const PLATFORMS = [
  "youtube",
  "wechat",
  "twitter",
  "xiaohongshu",
  "landscape",
] as const;
export const PROVIDERS = ["tuzi", "tuzi-openai"] as const;
export const SIZES = ["default", "2k"] as const;
export const ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type StyleIndex = typeof styleIndex;
export type StyleName = keyof StyleIndex;
export const STYLE_NAMES = Object.keys(styleIndex) as StyleName[];
