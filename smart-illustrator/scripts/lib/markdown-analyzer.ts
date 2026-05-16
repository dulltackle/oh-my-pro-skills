export interface MarkdownSection {
  level: number;
  title: string;
  content: string;
}

export interface SlidePicture {
  id: number;
  topic: string;
  content: string;
}

export interface MarkdownFenceState {
  marker: "`" | "~";
  length: number;
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

export function compactText(value: string, limit: number): string {
  const normalized = stripMarkdown(value).replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

export function getNextMarkdownFenceState(
  activeFence: MarkdownFenceState | null,
  line: string,
): MarkdownFenceState | null | undefined {
  const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
  if (!fenceMatch) return undefined;

  const marker = fenceMatch[1][0] as "`" | "~";
  const length = fenceMatch[1].length;

  if (!activeFence) {
    return { marker, length };
  }

  const isClosingFence =
    activeFence.marker === marker &&
    length >= activeFence.length &&
    fenceMatch[2].trim() === "";
  if (isClosingFence) {
    return null;
  }

  return activeFence;
}

export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<MarkdownSection & { lines: string[] }> = [];
  let current: (MarkdownSection & { lines: string[] }) | null = null;
  let activeFence: MarkdownFenceState | null = null;

  for (const line of lines) {
    const nextFenceState = getNextMarkdownFenceState(activeFence, line);
    if (nextFenceState !== undefined) {
      if (!current) {
        current = {
          level: 0,
          title: "",
          content: "",
          lines: [],
        };
      }

      activeFence = nextFenceState;
      current.lines.push(line);
      continue;
    }

    if (activeFence) {
      if (!current) {
        current = {
          level: 0,
          title: "",
          content: "",
          lines: [],
        };
      }
      current.lines.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) {
        current.content = current.lines.join("\n").trim();
        sections.push(current);
      }
      current = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        content: "",
        lines: [],
      };
      continue;
    }

    if (!current) {
      current = {
        level: 0,
        title: "",
        content: "",
        lines: [],
      };
    }
    current.lines.push(line);
  }

  if (current) {
    current.content = current.lines.join("\n").trim();
    sections.push(current);
  }

  return sections.filter(
    (section) => section.title.trim() !== "" || section.content.trim() !== "",
  );
}

export function extractDocumentTitle(markdown: string, fallback: string): string {
  const headingMatch = markdown.match(/^#\s+(.+?)\s*$/m);
  if (headingMatch) return headingMatch[1].trim();

  const firstLine = stripMarkdown(markdown)
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine || fallback;
}

export function buildCoverSummary(markdown: string): string {
  return compactText(markdown, 800);
}

export function buildArticleSections(
  markdown: string,
  articleTitle: string,
): MarkdownSection[] {
  const sections = splitMarkdownSections(markdown);
  const levelTwoPlus = sections.filter(
    (section) =>
      section.level >= 2 &&
      section.level <= 3 &&
      stripMarkdown(section.content).length > 10,
  );
  if (levelTwoPlus.length > 0) {
    return levelTwoPlus;
  }

  const titledIntro = sections.find(
    (section) =>
      section.title === articleTitle && stripMarkdown(section.content).length > 10,
  );
  if (titledIntro) {
    return [
      {
        level: 2,
        title: "核心内容",
        content: titledIntro.content,
      },
    ];
  }

  const intro = sections.find(
    (section) =>
      stripMarkdown(section.content).length > 10 && section.title !== articleTitle,
  );
  if (intro) {
    return [
      {
        level: 2,
        title: intro.title || "核心内容",
        content: intro.content,
      },
    ];
  }

  return [
    {
      level: 2,
      title: "核心内容",
      content: markdown,
    },
  ];
}

export function buildSlidesPictures(markdown: string, title: string): SlidePicture[] {
  const sections = splitMarkdownSections(markdown);
  const bodySections = sections.filter(
    (section) => section.level >= 2 && stripMarkdown(section.content).length > 10,
  );

  const pictures: SlidePicture[] = [
    {
      id: 1,
      topic: "封面",
      content: compactText(`${title}\n\n${buildCoverSummary(markdown)}`, 800),
    },
  ];

  if (bodySections.length > 0) {
    bodySections.forEach((section, index) => {
      pictures.push({
        id: index + 2,
        topic: section.title,
        content: compactText(section.content, 1200),
      });
    });
    return pictures;
  }

  pictures.push({
    id: 2,
    topic: "核心内容",
    content: compactText(markdown, 1200),
  });
  return pictures;
}
