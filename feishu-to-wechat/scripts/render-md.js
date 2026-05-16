#!/usr/bin/env node
/**
 * render-md.js v2 — Markdown → 微信兼容 HTML 渲染引擎
 *
 * 兼容 marked v17+ Token 对象 API
 * 基于 marked + highlight.js + juice (CSS 内联)
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');
const juice = require('juice');

const SKILL_DIR = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(SKILL_DIR, 'themes');
const IMG_PREFIX = 'WECHATIMGPH_';

// ── 主题 CSS ────────────────────────────────────────────

function loadThemeCss(name) {
  for (const p of [
    path.join(THEMES_DIR, 'baoyu', name + '.css'),
    path.join(THEMES_DIR, name + '.css'),
    path.join(THEMES_DIR, 'baoyu', 'default.css'),
  ]) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  }
  return '';
}

// ── Token → 文本提取 ───────────────────────────────────

function T(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.text) return val.text;
  return String(val);
}

// ── 微信兼容后处理 ─────────────────────────────────────

function postProcessForWechat(html) {
  // Fix 1: 去掉 <li> 内的 <p> 包裹
  // marked 的 loose list 会生成 <li><p>内容</p></li>
  // 微信编辑器把 </p></li>\n 当作空列表项
  html = html.replace(/<li(\s[^>]*)?>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, '<li$1>$2</li>');

  // Fix 2: 紧凑化列表标签（去掉 </li> 和下一个标签间的换行/空白）
  html = html.replace(/<\/li>\s*/g, '</li>');
  html = html.replace(/\s*<(\/?(?:ul|ol|li))/g, '<$1');

  return html;
}

// ── 外链转脚注 ───────────────────────────────────────────

/**
 * 将 HTML 中的外部链接转换为脚注形式
 * - <a href="https://...">文字</a> → 文字 <sup>[n]</sup>
 * - 文末追加「参考资料」脚注区域
 * - 跳过锚点链接（href 以 # 开头）
 * - 跳过图片链接（由 image renderer 处理）
 *
 * @param {string} html - 已渲染的 HTML
 * @param {Object} options - { linkStyle: 'footnote' | 'keep' }
 * @returns {string} 处理后的 HTML
 */
function convertLinksToFootnotes(html, options = {}) {
  if (options.linkStyle === 'keep') return html;

  const links = [];
  const linkMap = new Map(); // 避免重复链接

  // 匹配所有 <a> 标签，排除锚点链接
  const aTagRegex = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let processedHtml = html.replace(aTagRegex, (fullMatch, href, text) => {
    // 跳过锚点链接
    if (href.startsWith('#')) return fullMatch;

    // 跳过非 HTTP(S) 链接（如 mailto:、javascript:）
    if (!href.match(/^https?:\/\//i)) return fullMatch;

    // 跳过已经是微信 CDN 的链接（图片占位符流程已处理）
    if (href.includes('mmbiz.qpic.cn')) return fullMatch;

    // 检查是否已存在该链接
    let index = linkMap.get(href);
    if (index === undefined) {
      index = links.length + 1;
      links.push(href);
      linkMap.set(href, index);
    }

    // 替换为「文字 <sup>[n]</sup>」
    // 保留原始链接的 title 属性（如果有）
    return `${text} <sup style="color:#576b95;font-size:0.75em;">[${index}]</sup>`;
  });

  // 如果没有外链，直接返回
  if (links.length === 0) return processedHtml;

  // 构建脚注区域（微信兼容样式）
  const footnoteStyle = `
    style="
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e8e8e8;
      font-size: 14px;
      color: #666;
      line-height: 1.8;
    "
  `.replace(/\s+/g, ' ').trim();

  const titleStyle = `
    style="
      font-weight: bold;
      font-size: 15px;
      color: #333;
      margin-bottom: 12px;
    "
  `.replace(/\s+/g, ' ').trim();

  const linkStyle = `
    style="
      color: #576b95;
      text-decoration: none;
      word-break: break-all;
    "
  `.replace(/\s+/g, ' ').trim();

  const footnoteList = links.map((url, i) => {
    return `<div ${footnoteStyle.replace('margin-top: 32px;', 'margin-top: 8px;')}>
      <span style="color:#999;">[${i + 1}]</span>
      <a href="${url}" ${linkStyle}>${url}</a>
    </div>`;
  }).join('\n');

  const footnoteSection = `
<div ${footnoteStyle}>
  <div ${titleStyle}>参考资料：</div>
  ${footnoteList}
</div>
`.trim();

  // 在 </div>（#output 的闭合标签）前插入脚注区域
  // 优先匹配 #output div
  if (processedHtml.includes('<div id="output">')) {
    processedHtml = processedHtml.replace(
      /<\/div>\s*<\/body>/i,
      `\n${footnoteSection}\n</div></body>`
    );
  } else {
    // 兜底：直接追加到末尾
    processedHtml = processedHtml.replace(
      /<\/body>/i,
      `\n${footnoteSection}\n</body>`
    );
  }

  return processedHtml;
}

// ── 渲染 ────────────────────────────────────────────────

function renderMarkdown(mdText, options = {}) {
  const theme = options.theme || 'default';
  const imgList = [];

  marked.use({
    renderer: {
      heading(token) {
        const d = token.depth || 1;
        return `<h${d}>${T(token.text)}</h${d}>`;
      },
      code(token) {
        const lang = (token.lang && hljs.getLanguage(token.lang)) ? token.lang : 'plaintext';
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(T(token.text), { language: lang }).value}</code></pre>`;
      },
      codespan(token) {
        return `<code>${T(token.text)}</code>`;
      },
      image(token) {
        const idx = imgList.length + 1;
        const ph = `${IMG_PREFIX}${idx}`;
        imgList.push({ placeholder: ph, originalSrc: token.href || '', alt: token.alt || '' });
        return `<img src="${ph}" alt="${token.alt||''}" data-original-src="${token.href||''}" style="display:block;width:100%;margin:16px auto;"/>`;
      },
      link(token) {
        return `<a href="${token.href||''}">${T(token.text)}</a>`;
      },
      strong(token) {
        return `<strong>${T(token.text)}</strong>`;
      },
      em(token) {
        return `<em>${T(token.text)}</em>`;
      },
      // listitem / tablecell 等不覆盖，用默认 renderer 处理嵌套 Token
    },
  });

  let html = marked.parse(mdText);

  // 微信兼容后处理
  html = postProcessForWechat(html);

  html = `<div id="output">${html}</div>`;
  html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>${html}</body></html>`;

  // CSS 内联
  const css = loadThemeCss(theme);
  if (css) {
    try {
      html = juice(html, {
        extraCss: css,
        inlinePseudoElements: false,
        preserveImportant: true,
        preserveFontFaces: false,
        removeStyleTags: true,
        applyStyleTags: false,
      });
    } catch (e) {
      console.error(`[render-md] juice 警告: ${e.message}`);
    }
  }

  // 外链转脚注（在 CSS 内联之后）
  if (options.convertLinks !== false) { // 默认开启，传 false 关闭
    html = convertLinksToFootnotes(html, options);
  }

  return { html, imagePlaceholders: imgList };
}

function renderFile(filePath, options) {
  if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  let title = options.title;
  if (!title) {
    const m = content.match(/^#\s+(.+)$/m);
    if (m) title = m[1].trim();
  }
  const result = renderMarkdown(content, options);
  result.title = title;
  return result;
}

module.exports = { renderMarkdown, renderFile, loadThemeCss, IMG_PLACEHOLDER_PREFIX: IMG_PREFIX };

// ── CLI（commander）─────────────────────────────────────
if (require.main === module) {
  const { program } = require('commander');

  program
    .name('render-md.js')
    .description('Markdown → 微信兼容 HTML 渲染引擎')
    .argument('<input.md>', '输入 Markdown 文件')
    .option('--theme <name>', '主题名（默认: default）', 'default')
    .option('--output <path>', '输出 HTML 文件路径')
    .option('-h, --help', '显示帮助');

  program.parse();
  const opts = program.opts();
  const file = program.args[0];

  if (!file) {
    console.error('用法: node render-md.js <input.md> [--theme name] [--output path]');
    process.exit(1);
  }

  try {
    const r = renderFile(file, { theme: opts.theme });
    if (opts.output) {
      fs.writeFileSync(opts.output, r.html, 'utf-8');
      console.error(`[render-md] ✅ ${opts.output} | 标题: ${r.title} | 图片: ${r.imagePlaceholders.length}`);
      console.log(JSON.stringify({success:true, outputPath:opts.output, title:r.title, imageCount:r.imagePlaceholders.length}));
    } else {
      console.log(JSON.stringify(r, null, 2));
    }
  } catch(e) {
    console.error(`[render-md] ❌ ${e.message}`);
    process.exit(1);
  }
}
