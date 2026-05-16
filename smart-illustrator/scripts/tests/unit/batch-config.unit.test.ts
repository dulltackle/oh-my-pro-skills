import { describe, expect, it } from "vitest";
import {
  buildPromptFromUnified,
  parseRegenerateIds,
  validateUnifiedConfig,
} from "../../lib/batch-config.js";

describe("batch-config", () => {
  it("validates unified config and preserves optional fields", () => {
    const config = validateUnifiedConfig({
      instruction: "生成两张图",
      batch_rules: {
        total: 2,
        one_item_one_image: true,
        aspect_ratio: "16:9",
        do_not_merge: true,
      },
      fallback: "逐张生成",
      style: "Simple style",
      pictures: [
        { id: 1, topic: "Cover", content: "Intro" },
        { id: 2, topic: "Flow", content: "Body" },
      ],
    });

    expect(config).toMatchObject({
      instruction: "生成两张图",
      fallback: "逐张生成",
      style: "Simple style",
      batch_rules: {
        total: 2,
        one_item_one_image: true,
        aspect_ratio: "16:9",
        do_not_merge: true,
      },
      pictures: [
        { id: 1, topic: "Cover", content: "Intro" },
        { id: 2, topic: "Flow", content: "Body" },
      ],
    });
  });

  it("rejects legacy and malformed configs with actionable messages", () => {
    expect(() =>
      validateUnifiedConfig({
        style: "Style",
        illustrations: [],
      }),
    ).toThrow("旧版批量配置已移除");

    expect(() =>
      validateUnifiedConfig({
        style: "",
        pictures: [{ id: 1, topic: "Topic", content: "Content" }],
      }),
    ).toThrow("`style` 必须是非空字符串");

    expect(() =>
      validateUnifiedConfig({
        style: "Style",
        pictures: [{ id: 7, topic: 123, content: "Content" }],
      }),
    ).toThrow("pictures[0] (id=7).topic");
  });

  it("parses regenerate ids and rejects invalid values", () => {
    expect(parseRegenerateIds(undefined, [1, 2])).toBeNull();
    expect(parseRegenerateIds("1, 2", [1, 2, 3])).toEqual(new Set([1, 2]));

    for (const value of ["", "abc", "1,,2", "0", "-1", "1.5"]) {
      expect(() => parseRegenerateIds(value, [1, 2])).toThrow(
        "--regenerate 只支持正整数列表",
      );
    }

    expect(() => parseRegenerateIds("3", [1, 2])).toThrow(
      "--regenerate 包含不存在的图片 id: 3",
    );
  });

  it("builds prompts from picture content and shared style", () => {
    expect(
      buildPromptFromUnified(
        { id: 1, topic: "架构", content: "模块关系" },
        "Clean infographic style",
      ),
    ).toContain("**主题方向**: 架构");
  });
});
