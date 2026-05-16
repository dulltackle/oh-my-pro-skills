#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  handleArticleMode,
  handleCoverMode,
  handleSlidesMode,
} from "./lib/artifact-builder.js";
import { bootstrapEnv } from "./lib/env.js";
import {
  asSmartIllustratorError,
  formatCliError,
} from "./lib/errors.js";
import { extractDocumentTitle } from "./lib/markdown-analyzer.js";
import { deriveBaseName } from "./lib/output-writer.js";
import {
  parseSmartArgs,
  resolveSmartOptions,
  validateSmartOptions,
} from "./lib/smart-options.js";

export async function main() {
  await bootstrapEnv();
  const cwd = process.cwd();
  const options = resolveSmartOptions(parseSmartArgs(process.argv.slice(2)), cwd);
  validateSmartOptions(options);

  const inputPath = options.inputPath ? resolve(cwd, options.inputPath) : null;
  const outputDir = resolve(
    cwd,
    options.outputDir || (inputPath ? dirname(inputPath) : process.cwd()),
  );
  const markdown = inputPath ? await readFile(inputPath, "utf-8") : "";
  const baseName = deriveBaseName(inputPath, options.topic);
  const articleTitle = options.topic || extractDocumentTitle(markdown, baseName);
  const context = { markdown, articleTitle, baseName, outputDir, options };

  switch (options.mode) {
    case "slides":
      await handleSlidesMode(context);
      return;
    case "cover":
      await handleCoverMode(context);
      return;
    case "article":
      await handleArticleMode(context);
      return;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(`Error: ${formatCliError(asSmartIllustratorError(error))}`);
    process.exit(1);
  });
}
