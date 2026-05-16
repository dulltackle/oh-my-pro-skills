import { SmartIllustratorError } from "./errors.js";

export interface PictureConfig {
  id: number;
  topic: string;
  content: string;
}

export interface BatchRules {
  total: number;
  one_item_one_image?: boolean;
  aspect_ratio?: string;
  do_not_merge?: boolean;
}

export interface UnifiedConfig {
  instruction?: string;
  batch_rules?: BatchRules;
  fallback?: string;
  style: string;
  pictures: PictureConfig[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildPromptFromUnified(picture: PictureConfig, style: string): string {
  return `${style}

---

请为以下内容生成一张信息图：

**主题方向**: ${picture.topic}

**内容**:
${picture.content}`;
}

export function validateUnifiedConfig(config: unknown): UnifiedConfig {
  if (!isRecord(config)) {
    throw new Error("配置文件必须是一个 JSON 对象");
  }

  if ("illustrations" in config) {
    throw new Error(
      "旧版批量配置已移除：检测到顶层 `illustrations` 字段，请改用 `pictures` 数组的统一格式。",
    );
  }

  if (typeof config.style !== "string" || config.style.trim() === "") {
    throw new Error("`style` 必须是非空字符串");
  }

  if (!Array.isArray(config.pictures)) {
    throw new Error("`pictures` 必须是数组");
  }

  if (config.pictures.length === 0) {
    throw new Error("`pictures` 不能为空数组");
  }

  const pictures: PictureConfig[] = config.pictures.map((picture, index) => {
    if (!isRecord(picture)) {
      throw new Error(`\`pictures[${index}]\` 必须是对象`);
    }

    const idLabel =
      typeof picture.id === "number" && Number.isFinite(picture.id)
        ? `pictures[${index}] (id=${picture.id})`
        : `pictures[${index}]`;

    if (typeof picture.id !== "number" || !Number.isFinite(picture.id)) {
      throw new Error(`\`${idLabel}.id\` 必须是数字`);
    }

    if (typeof picture.topic !== "string") {
      throw new Error(`\`${idLabel}.topic\` 必须是字符串`);
    }

    if (typeof picture.content !== "string") {
      throw new Error(`\`${idLabel}.content\` 必须是字符串`);
    }

    return {
      id: picture.id,
      topic: picture.topic,
      content: picture.content,
    };
  });

  const validatedConfig: UnifiedConfig = {
    style: config.style,
    pictures,
  };

  if (typeof config.instruction === "string") {
    validatedConfig.instruction = config.instruction;
  }
  if (isRecord(config.batch_rules)) {
    validatedConfig.batch_rules = {
      total:
        typeof config.batch_rules.total === "number"
          ? config.batch_rules.total
          : pictures.length,
      one_item_one_image:
        typeof config.batch_rules.one_item_one_image === "boolean"
          ? config.batch_rules.one_item_one_image
          : undefined,
      aspect_ratio:
        typeof config.batch_rules.aspect_ratio === "string"
          ? config.batch_rules.aspect_ratio
          : undefined,
      do_not_merge:
        typeof config.batch_rules.do_not_merge === "boolean"
          ? config.batch_rules.do_not_merge
          : undefined,
    };
  }
  if (typeof config.fallback === "string") {
    validatedConfig.fallback = config.fallback;
  }

  return validatedConfig;
}

export function parseRegenerateIds(
  value: string | undefined,
  availableIds: number[],
): Set<number> | null {
  if (value === undefined) {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    throw new SmartIllustratorError({
      kind: "input",
      code: "INVALID_REGENERATE_IDS",
      message: "--regenerate 只支持正整数列表，例如 1 或 1,3,5",
      retryable: false,
    });
  }

  const parts = raw.split(",");
  const ids = parts.map((part) => {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new SmartIllustratorError({
        kind: "input",
        code: "INVALID_REGENERATE_IDS",
        message: "--regenerate 只支持正整数列表，例如 1 或 1,3,5",
        retryable: false,
      });
    }

    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new SmartIllustratorError({
        kind: "input",
        code: "INVALID_REGENERATE_IDS",
        message: "--regenerate 只支持正整数列表，例如 1 或 1,3,5",
        retryable: false,
      });
    }

    return id;
  });

  const availableIdSet = new Set(availableIds);
  const missingIds = [...new Set(ids.filter((id) => !availableIdSet.has(id)))];
  if (missingIds.length > 0) {
    throw new SmartIllustratorError({
      kind: "input",
      code: "UNKNOWN_REGENERATE_IDS",
      message:
        `--regenerate 包含不存在的图片 id: ${missingIds.join(", ")}。` +
        `可用 id: ${availableIds.join(", ")}`,
      retryable: false,
    });
  }

  return new Set(ids);
}
