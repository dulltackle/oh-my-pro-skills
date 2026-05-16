import { describe, expect, it } from "vitest";
import { parseCliArgs, type CliOptionSpec } from "../../lib/cli-args.js";
import { SmartIllustratorError } from "../../lib/errors.js";

const specs: CliOptionSpec[] = [
  { name: "help", aliases: ["-h"], type: "boolean" },
  { name: "mode", type: "string", choices: ["article", "slides"] },
  { name: "output", aliases: ["-o"], type: "string" },
  { name: "ref", aliases: ["-r"], type: "string", repeatable: true },
  { name: "count", aliases: ["-c"], type: "integer", min: 1, max: 4 },
  { name: "timeout", type: "integer", min: 1000, defaultValue: 45_000 },
  {
    name: "old",
    type: "boolean",
    removedMessage: "--old has been removed. Use --new.",
  },
];

describe("parseCliArgs", () => {
  it("parses long values, equals syntax, short aliases, repeatables, and positionals", () => {
    const parsed = parseCliArgs(
      [
        "article.md",
        "--mode=slides",
        "-o",
        "out.png",
        "-r",
        "a.png",
        "--ref",
        "b.png",
        "-c",
        "9",
      ],
      specs,
    );

    expect(parsed.positionals).toEqual(["article.md"]);
    expect(parsed.values.mode).toBe("slides");
    expect(parsed.values.output).toBe("out.png");
    expect(parsed.values.ref).toEqual(["a.png", "b.png"]);
    expect(parsed.values.count).toBe(4);
    expect(parsed.values.timeout).toBe(45_000);
  });

  it("rejects unknown arguments", () => {
    expect(() => parseCliArgs(["--unknown"], specs)).toThrow(/未知参数：--unknown/);
  });

  it("rejects missing values", () => {
    expect(() => parseCliArgs(["--mode"], specs)).toThrow(/--mode 缺少参数值/);
  });

  it("rejects invalid choices", () => {
    expect(() => parseCliArgs(["--mode", "cover"], specs)).toThrow(
      /--mode 不支持：cover/,
    );
  });

  it("rejects positionals when disabled", () => {
    expect(() =>
      parseCliArgs(["input.md"], specs, { allowPositionals: false }),
    ).toThrow(/不允许位置参数：input.md/);
  });

  it("surfaces removed argument migration messages", () => {
    expect(() => parseCliArgs(["--old"], specs)).toThrow(SmartIllustratorError);
    expect(() => parseCliArgs(["--old"], specs)).toThrow(
      /--old has been removed. Use --new./,
    );
  });
});
