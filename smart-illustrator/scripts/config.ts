/**
 * Configuration management for Smart Illustrator.
 * Shared by the high-level orchestrator and the low-level single-image CLI.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, isAbsolute, relative } from "path";
import { homedir } from "os";
import {
  ASPECT_RATIOS,
  PLATFORMS,
  PROVIDERS,
  SIZES,
  STYLE_NAMES,
} from "./lib/cli-metadata.js";
import type {
  AspectRatio,
  Platform,
  Provider,
  Size,
  StyleName,
} from "./lib/cli-types.js";

const STYLE_NAME_SET = new Set<StyleName>(STYLE_NAMES);
const PROVIDER_SET = new Set<Provider>(PROVIDERS);
const SIZE_SET = new Set<Size>(SIZES);
const PLATFORM_SET = new Set<Platform>(PLATFORMS);
const ASPECT_RATIO_SET = new Set<AspectRatio>(ASPECT_RATIOS);

export interface Config {
  style?: StyleName;
  platform?: Platform;
  provider?: Provider;
  model?: string;
  size?: Size;
  aspectRatio?: AspectRatio;
  references?: string[];
  candidates?: number;
  outputDir?: string;
}

const PROJECT_CONFIG_DIR = ".smart-illustrator";
const PROJECT_CONFIG_FILE = "config.json";
const USER_CONFIG_DIR = join(homedir(), ".smart-illustrator");
const USER_CONFIG_FILE = join(USER_CONFIG_DIR, "config.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveStoredPath(value: string, baseDir: string): string {
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  if (isAbsolute(value)) {
    return value;
  }
  return resolve(baseDir, value);
}

function normalizeConfig(raw: unknown, baseDir: string): Config {
  if (!isRecord(raw)) {
    return {};
  }

  const config: Config = {};

  if (typeof raw.style === "string" && STYLE_NAME_SET.has(raw.style as StyleName)) {
    config.style = raw.style as StyleName;
  }

  if (
    typeof raw.platform === "string" &&
    PLATFORM_SET.has(raw.platform as Platform)
  ) {
    config.platform = raw.platform as Platform;
  }

  if (
    typeof raw.provider === "string" &&
    PROVIDER_SET.has(raw.provider as Provider)
  ) {
    config.provider = raw.provider as Provider;
  }

  if (typeof raw.model === "string" && raw.model.trim().length > 0) {
    config.model = raw.model;
  }

  if (typeof raw.size === "string" && SIZE_SET.has(raw.size as Size)) {
    config.size = raw.size as Size;
  }

  if (
    typeof raw.aspectRatio === "string" &&
    ASPECT_RATIO_SET.has(raw.aspectRatio as AspectRatio)
  ) {
    config.aspectRatio = raw.aspectRatio as AspectRatio;
  }

  if (Array.isArray(raw.references)) {
    const references = raw.references
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => resolveStoredPath(value, baseDir));
    if (references.length > 0) {
      config.references = references;
    }
  }

  if (typeof raw.candidates === "number" && Number.isInteger(raw.candidates)) {
    config.candidates = Math.min(4, Math.max(1, raw.candidates));
  }

  if (typeof raw.outputDir === "string" && raw.outputDir.trim().length > 0) {
    config.outputDir = resolveStoredPath(raw.outputDir, baseDir);
  }

  return config;
}

function readConfigFile(configPath: string, baseDir: string, scopeLabel: string): Config {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    console.log(`✓ Loaded ${scopeLabel} config: ${configPath}`);
    return normalizeConfig(parsed, baseDir);
  } catch (error) {
    console.warn(`⚠ Failed to load ${scopeLabel} config: ${error}`);
    return {};
  }
}

function makeStoredPath(value: string, baseDir: string): string {
  if (!isAbsolute(value)) {
    return value;
  }

  const relativePath = relative(baseDir, value);
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath || ".";
  }

  return value;
}

function toStoredConfig(config: Config, baseDir: string, global: boolean): Config {
  const stored: Config = { ...config };

  if (stored.references && stored.references.length > 0) {
    stored.references = stored.references.map((value) =>
      global ? value : makeStoredPath(value, baseDir),
    );
  }

  if (stored.outputDir) {
    stored.outputDir = global ? stored.outputDir : makeStoredPath(stored.outputDir, baseDir);
  }

  return stored;
}

/**
 * Load configuration from files
 * Priority: project-level > user-level > defaults
 */
export function loadConfig(cwd: string = process.cwd()): Config {
  const projectConfigPath = join(cwd, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
  const userConfig = readConfigFile(USER_CONFIG_FILE, USER_CONFIG_DIR, "user");
  const projectConfig = readConfigFile(projectConfigPath, cwd, "project");
  return { ...userConfig, ...projectConfig };
}

/**
 * Save configuration to file
 */
export function saveConfig(
  config: Config,
  options: { global?: boolean; cwd?: string } = {}
): void {
  const { global = false, cwd = process.cwd() } = options;

  const configDir = global ? USER_CONFIG_DIR : join(cwd, PROJECT_CONFIG_DIR);
  const configPath = global ? USER_CONFIG_FILE : join(configDir, PROJECT_CONFIG_FILE);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const baseDir = global ? USER_CONFIG_DIR : cwd;
  const existingConfig = readConfigFile(
    configPath,
    baseDir,
    global ? "user" : "project",
  );
  const configToSave = toStoredConfig(mergeConfig(existingConfig, config), baseDir, global);

  writeFileSync(configPath, JSON.stringify(configToSave, null, 2), "utf-8");
  console.log(`✓ Saved ${global ? "user" : "project"} config: ${configPath}`);
}

/**
 * Merge command-line arguments with loaded config
 * CLI arguments take precedence
 */
export function mergeConfig(
  loadedConfig: Config,
  cliArgs: Partial<Config>
): Config {
  const merged: Config = { ...loadedConfig };

  if (cliArgs.style !== undefined) {
    merged.style = cliArgs.style;
  }

  if (cliArgs.platform !== undefined) {
    merged.platform = cliArgs.platform;
  }

  if (cliArgs.provider !== undefined) {
    merged.provider = cliArgs.provider;
  }

  if (cliArgs.model !== undefined) {
    merged.model = cliArgs.model;
  }

  if (cliArgs.size !== undefined) {
    merged.size = cliArgs.size;
  }

  if (cliArgs.aspectRatio !== undefined) {
    merged.aspectRatio = cliArgs.aspectRatio;
  }

  if (cliArgs.references !== undefined && cliArgs.references.length > 0) {
    merged.references = cliArgs.references;
  }

  if (cliArgs.candidates !== undefined) {
    merged.candidates = Math.min(4, Math.max(1, cliArgs.candidates));
  }

  if (cliArgs.outputDir !== undefined) {
    merged.outputDir = cliArgs.outputDir;
  }

  return merged;
}
