#!/usr/bin/env node
/**
 * extract-meta.js — 智能提取 Markdown 文档元数据
 *
 * 功能：
 * - 从 Markdown 或 HTML 提取标题、摘要
 * - 支持 YAML frontmatter（优先级最高）
 * - 自动从正文推断缺失的字段
 *
 * 用法：
 *   node extract-meta.js <input.md>
 *   node extract-meta.js <input.html> --type html
 *
 * 输出（JSON）：
 *   {
 *     "title": "文章标题",
 *     "digest": "文章摘要（120 字以内）"
 *   }
 */

const fs = require('fs');
const path = require('path');

// ── Frontmatter 解析 ───────────────────────────────────

/**
 * 解析 YAML frontmatter（简单的键值对格式）
 * 支持：
 *   ---
 *   title: 文章标题
 *   description: 这是描述
 *   cover: ./cover.jpg
 *   ---
 */
function parseFrontmatter(text) {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) return {};

  const frontmatter = {};
  const lines = fmMatch[1].split('\n');

  for (const line of lines) {
    // 简单的 key: value 格式（不支持嵌套）
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1].toLowerCase();
      let value = match[2].trim();

      // 去掉引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

// ── 标题提取 ───────────────────────────────────────────

/**
 * 从 Markdown 提取标题
 * 优先级：
 *   1. frontmatter.title
 *   2. 第一个 # 标题
 *   3. 文件名（不含扩展名）
 */
function extractTitle(mdText, filePath = null) {
  // 1. frontmatter
  const fm = parseFrontmatter(mdText);
  if (fm.title) return fm.title;

  // 2. 第一个 # 标题
  const h1Match = mdText.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // 3. 文件名
  if (filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  return '未命名文档';
}

/**
 * 从 HTML 提取标题
 */
function extractTitleFromHtml(html) {
  // <title> 标签
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();

  // <h1> 标签
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();

  return '未命名文档';
}

// ── 摘要提取 ───────────────────────────────────────────

/**
 * 从 Markdown 提取摘要
 * 优先级：
 *   1. frontmatter.description / summary / digest
 *   2. 正文第一段纯文本（去掉 Markdown 格式），截取 120 字
 *   3. 如果第一段太短（<20 字），取前两段拼接
 */
function extractDigest(mdText, maxLength = 120) {
  // 1. frontmatter
  const fm = parseFrontmatter(mdText);
  if (fm.description) return truncate(fm.description, maxLength);
  if (fm.summary) return truncate(fm.summary, maxLength);
  if (fm.digest) return truncate(fm.digest, maxLength);

  // 去掉 frontmatter
  let content = mdText.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

  // 去掉标题行（# 开头）
  content = content.replace(/^#+\s+.*$/gm, '');

  // 提取纯文本段落（去掉 Markdown 格式）
  const paragraphs = content
    .split(/\n\n+/) // 按空行分割
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.match(/^(?:>|-|\*|\+|\d+\.)/)) // 排除引用、列表
    .map(p => stripMarkdown(p));

  if (paragraphs.length === 0) return '';

  // 2. 第一段
  let digest = paragraphs[0];

  // 3. 如果第一段太短，拼接第二段
  if (digest.length < 20 && paragraphs.length > 1) {
    digest = paragraphs[0] + ' ' + paragraphs[1];
  }

  return truncate(digest, maxLength);
}

/**
 * 从 HTML 提取摘要
 */
function extractDigestFromHtml(html, maxLength = 120) {
  // 提取 <body> 内的纯文本
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1] : html;

  // 去掉 HTML 标签
  content = content.replace(/<[^>]+>/g, ' ');

  // 去掉多余的空白
  content = content.replace(/\s+/g, ' ').trim();

  return truncate(content, maxLength);
}

// ── 工具函数 ───────────────────────────────────────────

/**
 * 去掉 Markdown 格式，保留纯文本
 */
function stripMarkdown(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // 图片
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接
    .replace(/[*_`~]+/g, '') // 强调、代码
    .replace(/#{1,6}\s*/g, '') // 标题
    .replace(/\n/g, ' ') // 换行转空格
    .trim();
}

/**
 * 截断文本到指定长度
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * 解析图片路径（支持相对路径）
 */
function resolveImagePath(imgPath, basePath) {
  if (!imgPath) return null;

  // 已经是绝对路径或 URL
  if (imgPath.startsWith('/') || imgPath.match(/^https?:\/\//i)) {
    return imgPath;
  }

  // 相对路径：基于 basePath 解析
  if (basePath) {
    const resolved = path.resolve(basePath, imgPath);
    // 验证文件存在
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  // 返回原始路径（可能不存在）
  return imgPath;
}

// ── 主函数 ─────────────────────────────────────────────

function extractMetadata(inputPath, options = {}) {
  const inputType = options.type || (inputPath.endsWith('.html') ? 'html' : 'md');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`文件不存在: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf-8');
  const basePath = path.dirname(inputPath);

  let title, digest;

  if (inputType === 'html') {
    title = extractTitleFromHtml(content);
    digest = extractDigestFromHtml(content, options.maxLength || 120);
  } else {
    title = extractTitle(content, inputPath);
    digest = extractDigest(content, options.maxLength || 120);
  }

  return { title, digest };
}

// ── CLI（commander）─────────────────────────────────────
function main() {
  const { program } = require('commander');

  program
    .name('extract-meta.js')
    .description('智能提取 Markdown 文档元数据')
    .argument('<input>', '输入文件路径')
    .option('--type <md|html>', '输入文件类型（默认根据扩展名判断）')
    .option('--max-length <n>', '摘要最大长度（默认 120）', '120')
    .option('-h, --help', '显示帮助');

  program.parse();
  const opts = program.opts();
  const inputPath = program.args[0];

  if (!inputPath) {
    console.error('错误: 请指定输入文件');
    process.exit(1);
  }

  try {
    const result = extractMetadata(inputPath, {
      type: opts.type,
      maxLength: parseInt(opts.maxLength, 10),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
}

// ── 导出 ───────────────────────────────────────────────

module.exports = {
  extractMetadata,
  extractTitle,
  extractDigest,
  parseFrontmatter,
  stripMarkdown,
  truncate,
};

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  main();
}
