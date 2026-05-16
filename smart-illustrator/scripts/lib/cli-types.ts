import type {
  ASPECT_RATIOS,
  MODES,
  PLATFORMS,
  PROVIDERS,
  SIZES,
  STYLE_NAMES,
} from "./cli-metadata.js";
export {
  ASPECT_RATIOS,
  MODES,
  PLATFORMS,
  PROVIDERS,
  SIZES,
  STYLE_NAMES,
} from "./cli-metadata.js";

export type Mode = (typeof MODES)[number];
export type StyleName = (typeof STYLE_NAMES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Provider = (typeof PROVIDERS)[number];
export type Size = (typeof SIZES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface CliOptions {
  inputPath: string | null;
  mode: Mode;
  style: StyleName | null;
  platform: Platform;
  topic: string | null;
  promptOnly: boolean;
  noCover: boolean;
  refs: string[];
  ignoreMissingRef: boolean;
  candidates: number;
  aspectRatio?: AspectRatio;
  provider: Provider | null;
  model: string | null;
  size: Size;
  outputDir: string | null;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
}

export interface GeneratedArtifact {
  label: string;
  prompt: string;
  outputPath: string;
  aspectRatio: AspectRatio;
}

export interface GeneratedFileRecord {
  label: string;
  primaryOutput: string;
  allOutputs: string[];
}
