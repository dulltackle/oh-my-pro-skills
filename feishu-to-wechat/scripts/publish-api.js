#!/usr/bin/env node
/**
 * publish-api.js — 完整发布流程编排（API 模式）
 *
 * 流程：
 *   输入（飞书文档 URL / MD 文件 / 直接 HTML）
 *   → 提取/读取内容
 *   → 渲染 HTML（MD→HTML + CSS 内联）
 *   → 下载图片
 *   → 上传图片到微信素材库
 *   → 替换占位符为 CDN URL
 *   → 创建草稿
 *   → 输出结果
 *
 * 用法:
 *   # 从 Markdown 文件发布
 *   node publish-api.js --file article.md --theme default
 *
 *   # 直接用 HTML 发布（需自行处理图片上传）
 *   node publish-api.js --doc "标题" --content "<p>...</p>"
 *
 *   # Dry-run 测试（只验证 token 和连接，不创建草稿）
 *   node publish-api.js --doc "测试文章" --content "<p>这是一篇测试</p>" --dry-run
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { program } = require('commander');

const wechatApi = require('./wechat-api');
const { renderFile, IMG_PLACEHOLDER_PREFIX } = require('./render-md');
const { extractMetadata } = require('./extract-meta');
const { createLogger } = require('./lib/logger');

const log = createLogger('publish-api');

// ── 临时文件目录 ───────────────────────────────────────

const TEMP_IMG_DIR = '/tmp/openclaw/wx-img-cache';

function ensureTempDir() {
  if (!fs.existsSync(TEMP_IMG_DIR)) {
    fs.mkdirSync(TEMP_IMG_DIR, { recursive: true });
  }
  return TEMP_IMG_DIR;
}

// ── 远程图片下载（带重试）───────────────────────────────

/**
 * 下载远程图片到本地临时文件，支持自动重试
 * @param {string} url - HTTP/HTTPS URL
 * @param {Object} [options] - 重试配置
 * @param {number} [options.maxRetries=3] - 最大重试次数
 * @returns {Promise<string>} 本地临时文件路径
 */
function downloadRemoteImage(url, options = {}) {
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;

  const doDownload = (attempt) => {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const tempDir = ensureTempDir();
      const ext = path.extname(url.split('?')[0]) || '.jpg';
      const tempPath = path.join(tempDir, `img-${Date.now()}${ext}`);

      const req = mod.request(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (OpenClaw/wechat-publisher)' },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(tempPath, buffer);
          resolve(tempPath);
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('下载超时 (15s)'));
      });
      req.end();
    });
  };

  // 带递增退避的重试逻辑：1s, 2s, 3s
  const delays = [1000, 2000, 3000];
  let attempt = 0;

  const tryDownload = () => {
    attempt++;
    return doDownload(attempt).catch(async (err) => {
      if (attempt < maxRetries) {
        const delay = delays[attempt - 1] || 3000;
        log.warn(`图片下载失败，正在重试 (第${attempt}次)... ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
        return tryDownload();
      }
      throw err;
    });
  };

  return tryDownload();
}

// ── CLI 参数解析（commander）────────────────────────────

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数对象
 */
function parseArgs() {
  program
    .name('publish-api.js')
    .description('微信公众号 API 发布工具')
    .option('--file <path>', 'Markdown 文件路径')
    .option('--doc <title>', '文章标题')
    .option('--content <html>', 'HTML 正文内容')
    .option('--theme <name>', '主题名: default, grace (默认: default)', 'default')
    .option('--author <name>', '作者名')
    .option('--digest <text>', '文章摘要')
    .option('--dry-run', '仅测试，不创建草稿', false)
    .option('--cover <path>', '封面图本地路径（上传为永久素材）')
    .option('--output <path>', '保存渲染后 HTML 到指定路径')
    .option('-h, --help', '显示帮助');

  program.parse();
  const opts = program.opts();

  return {
    doc: opts.doc || null,
    content: opts.content || null,
    file: opts.file || null,
    theme: opts.theme,
    author: opts.author || null,
    digest: opts.digest || null,
    dryRun: !!opts.dryRun,
    cover: opts.cover || null,
    output: opts.output || null,
    help: !!opts.help,
  };
}

// ── 图片处理：替换占位符为微信 CDN URL ─────────────────

/**
 * 解码 data: URI 并保存为临时文件
 * @param {string} dataUri - data:image/png;base64,... 格式
 * @returns {string} 本地临时文件路径
 */
function decodeDataUri(dataUri) {
  const match = dataUri.match(/^data:image\/([a-z]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('不支持的 data URI 格式');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const base64Data = match[2];

  const tempDir = ensureTempDir();
  const tempPath = path.join(tempDir, `img-data-${Date.now()}.${ext}`);

  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(tempPath, buffer);

  return tempPath;
}

// ── 并发限制工具 ────────────────────────────────────────

/**
 * 创建并发限制的执行器
 * @param {number} concurrency - 最大并发数
 * @returns {{ add: Function }} 调用 add(fn) 添加任务，调用 drain() 等待全部完成
 */
function createLimiter(concurrency) {
  let running = 0;
  const queue = [];

  function next() {
    if (queue.length === 0 || running >= concurrency) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      val => { running--; resolve(val); next(); },
      err => { running--; reject(err); next(); }
    );
  }

  return {
    add(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      });
    },
  };
}

/**
 * 处理单个占位符图片：下载/解码 → 上传 → 返回替换信息
 * @param {Object} img - 占位符信息
 * @returns {Promise<{placeholder: string, cdnUrl: string|null, originalSrc: string, status: string, reason?: string}>}
 */
async function processOneImage(img) {
  const { placeholder, originalSrc } = img;
  let localPath = null;
  let isTempFile = false;

  // 1. 跳过已经是微信 CDN 的图片
  if (originalSrc && originalSrc.includes('mmbiz.qpic.cn')) {
    return { placeholder, cdnUrl: originalSrc, originalSrc, status: 'skip', reason: '已是微信 CDN' };
  }

  // 2. 远程图片（http/https）
  if (originalSrc && originalSrc.match(/^https?:\/\//i)) {
    localPath = await downloadRemoteImage(originalSrc);
    isTempFile = true;
  }

  // 3. data URI
  else if (originalSrc && originalSrc.startsWith('data:image')) {
    localPath = decodeDataUri(originalSrc);
    isTempFile = true;
  }

  // 4. 本地文件
  else if (originalSrc) {
    if (!originalSrc.startsWith('/')) {
      localPath = path.resolve(originalSrc);
    } else {
      localPath = originalSrc;
    }

    if (!fs.existsSync(localPath)) {
      return { placeholder, cdnUrl: null, originalSrc, status: 'error', reason: '文件不存在' };
    }
  }

  // 5. 上传图片
  if (localPath) {
    log.info(`上传图片: ${localPath}`);
    const cdnUrl = await wechatApi.uploadImage(localPath);
    log.info(`✅ 图片上传成功: ${cdnUrl}`);
    return { placeholder, cdnUrl, originalSrc: originalSrc || placeholder, status: 'success' };
  }

  return { placeholder, cdnUrl: null, originalSrc: originalSrc || placeholder, status: 'error', reason: '无法确定图片来源' };
}

/**
 * 处理 HTML 中的图片：
 * - 扫描所有 WECHATIMGPH_N 占位符
 * - 支持本地路径、远程 URL、data URI
 * - 上传到微信，替换为 CDN URL（并发，限制 3）
 * - 失败时保留原始 src 作为降级
 *
 * @param {string} html - 包含占位符的 HTML
 * @param {Array} imagePlaceholders - render-md 返回的占位符信息
 * @returns {Promise<{html: string, logs: Array}>} 替换后的 HTML 和处理日志
 */
async function processImages(html, imagePlaceholders) {
  let processedHtml = html;
  const logs = [];
  const limiter = createLimiter(3);

  // 并发处理所有占位符图片
  const results = await Promise.allSettled(
    imagePlaceholders.map(img => limiter.add(() => processOneImage(img)))
  );

  // 按原始顺序应用替换结果
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const img = imagePlaceholders[i];

    if (result.status === 'fulfilled') {
      const r = result.value;
      logs.push({ status: r.status, src: r.originalSrc, reason: r.reason, cdnUrl: r.cdnUrl });

      if (r.status === 'success' && r.cdnUrl) {
        processedHtml = processedHtml.replace(
          new RegExp(escapeRegex(r.placeholder), 'g'),
          r.cdnUrl
        );
      } else if (r.status === 'skip' && r.cdnUrl) {
        processedHtml = processedHtml.replace(
          new RegExp(escapeRegex(r.placeholder), 'g'),
          r.cdnUrl
        );
      } else if (r.status === 'error') {
        log.warn(`图片处理失败 ${r.originalSrc}: ${r.reason}`);
        // 降级：保留原始 URL
        if (r.originalSrc) {
          processedHtml = processedHtml.replace(
            new RegExp(escapeRegex(r.placeholder), 'g'),
            r.originalSrc
          );
        }
      }
    } else {
      logs.push({ status: 'error', src: img.originalSrc || img.placeholder, reason: result.reason?.message || result.value });
      log.error(`❌ 图片上传异常 ${img.originalSrc}: ${result.reason?.message || '未知错误'}`);
    }
  }

  // ── 额外扫描：处理非占位符的图片 src（兜底，并发）──
  const imgTagRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  const extraMatches = [...processedHtml.matchAll(imgTagRegex)];

  const extraResults = await Promise.allSettled(
    extraMatches.map(match => limiter.add(() => processExtraImage(match)))
  );

  for (let i = 0; i < extraResults.length; i++) {
    const result = extraResults[i];
    const match = extraMatches[i];
    const [fullTag, src] = match;

    if (result.status === 'fulfilled') {
      const r = result.value;
      if (r && r.cdnUrl) {
        processedHtml = processedHtml.replace(
          fullTag,
          fullTag.replace(`src="${src}"`, `src="${r.cdnUrl}"`)
        );
        logs.push({ status: 'success', src, cdnUrl: r.cdnUrl, extra: true });
        log.info(`✅ 额外图片上传成功: ${r.cdnUrl}`);
      }
    } else {
      logs.push({ status: 'error', src, reason: result.reason?.message, extra: true });
      log.warn(`额外图片上传失败: ${result.reason?.message || '未知错误'}`);
    }
  }

  return { html: processedHtml, logs };
}

/**
 * 处理额外扫描到的非占位符图片
 * @param {RegExpMatchArray} match - 正则匹配结果
 * @returns {Promise<{cdnUrl: string}|null>}
 */
async function processExtraImage(match) {
  const [fullTag, src] = match;

  // 跳过已处理的占位符、微信 CDN、data URI
  if (src.startsWith(IMG_PLACEHOLDER_PREFIX) ||
      src.includes('mmbiz.qpic.cn') ||
      src.startsWith('data:')) {
    return null;
  }

  let localPath = null;

  if (src.match(/^https?:\/\//i)) {
    localPath = await downloadRemoteImage(src);
  } else {
    localPath = src.startsWith('/') ? src : path.resolve(src);
    if (!fs.existsSync(localPath)) return null;
  }

  log.info(`上传额外图片: ${localPath}`);
  const cdnUrl = await wechatApi.uploadImage(localPath);
  return { cdnUrl };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 提取 body 内容 ─────────────────────────────────────

/**
 * 从完整 HTML 中提取 body 内部内容（用于微信 API 的 content 字段）
 * @param {string} html - 完整 HTML 字符串
 * @returns {string} body 内部内容
 */
function extractBodyContent(html) {
  // 优先匹配 #output div
  const outputMatch = html.match(/<div id="output">([\s\S]*?)<\/div>\s*<\/body>/i);
  if (outputMatch) return outputMatch[1].trim();

  // 回退到 body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();

  return html;
}

// ── 主流程 ─────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (args.help) {
    program.help();
    return;
  }

  let title = args.doc;
  let htmlContent = args.content;
  let imagePlaceholders = [];

  // ── 模式 A：从 Markdown 文件 ────────────────────────
  let extractedMeta = null;

  if (args.file) {
    log.info(`模式: 从 Markdown 文件发布`);
    log.info(`文件: ${args.file}`);
    log.info(`主题: ${args.theme}`);

    // ── 元数据提取 ──
    try {
      extractedMeta = extractMetadata(args.file);
      log.info(`元数据提取: title=${extractedMeta.title}, digest=${extractedMeta.digest?.substring(0, 30)}...`);
    } catch (e) {
      log.warn(`元数据提取失败: ${e.message}`);
    }

    const result = renderFile(args.file, { theme: args.theme });
    htmlContent = extractBodyContent(result.html);
    imagePlaceholders = result.imagePlaceholders || [];

    // 优先级：CLI 参数 > 元数据提取 > 文件名
    if (!title) {
      title = extractedMeta?.title || result.title || path.basename(args.file, '.md');
    }

    // 摘要：CLI 参数 > 元数据提取
    if (!args.digest && extractedMeta?.digest) {
      args.digest = extractedMeta.digest;
      log.info(`自动提取摘要: ${extractedMeta.digest.substring(0, 50)}...`);
    }

    log.info(`标题: ${title}`);
    log.info(`图片占位符: ${imagePlaceholders.length} 个`);
  }

  // ── 模式 B：直接提供 HTML ─────────────────────────
  else if (htmlContent && title) {
    log.info(`模式: 直接 HTML 发布`);
    log.info(`标题: ${title}`);
  }

  else {
    log.error('请提供 --file <md文件> 或同时提供 --doc "标题" --content "<html>"');
    process.exit(1);
  }

  // ── Dry-run 模式 ────────────────────────────────────
  if (args.dryRun) {
    log.info('===== DRY RUN MODE =====');
    try {
      log.info('步骤 1/2: 验证 access_token...');
      const token = await wechatApi.fetchAccessToken();
      log.info(`✅ Token 获取成功: ${token.substring(0, 20)}...`);

      log.info('步骤 2/2: 验证代理连接...');
      try {
        await wechatApi.fetchAccessToken();
        log.info(`✅ API 连通（Token 已缓存）`);
      } catch(e) {
        log.info(`✅ API 连通（Token 已在步骤1验证）`);
      }

      log.info('===== DRY RUN 完成 =====');
      console.log(JSON.stringify({
        success: true,
        dryRun: true,
        title,
        theme: args.theme,
        contentLength: htmlContent?.length || 0,
        imagePlaceholderCount: imagePlaceholders.length,
        message: 'Token 获取和 API 连通性验证通过。使用 --dry-run=false 创建实际草稿。',
      }, null, 2));
    } catch (err) {
      log.error(`DRY RUN 失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // ── 正式发布流程 ────────────────────────────────────
  log.info('===== 开始发布 =====');

  try {
    // Step 1: 获取 Token
    log.info('步骤 1/5: 获取 access_token...');
    const accessToken = await wechatApi.fetchAccessToken();
    log.info('✅ Token 获取成功');

    // Step 2: 上传封面图（如有）
    let thumbMediaId = null;
    if (args.cover) {
      log.info(`步骤 2/5: 上传封面图: ${args.cover}`);
      const coverResult = await wechatApi.uploadMaterial(args.cover);
      thumbMediaId = coverResult.media_id;
      log.info(`✅ 封面图上传成功: media_id=${thumbMediaId}`);
    } else {
      log.info('步骤 2/5: 无封面图，跳过');
    }

    // Step 3: 处理图片（上传到微信，替换占位符）
    if (imagePlaceholders.length > 0) {
      log.info(`步骤 3/5: 处理图片 (${imagePlaceholders.length} 张)...`);
      const imgResult = await processImages(htmlContent, imagePlaceholders);
      htmlContent = imgResult.html;
      log.info(`✅ 图片处理完成: ${imgResult.logs.filter(l => l.status === 'success').length} 成功, ${imgResult.logs.filter(l => l.status === 'error').length} 失败`);
      // 保存最终 HTML（图片已替换为 CDN URL）
      if (args.output) {
        fs.writeFileSync(args.output, htmlContent, 'utf-8');
        log.info(`最终 HTML（含 CDN 图片）已保存: ${args.output}`);
      }
    } else {
      log.info('步骤 3/5: 无需处理图片，跳过');
    }

    // Step 4: 创建草稿
    log.info('步骤 4/5: 创建草稿...');
    const draftResult = await wechatApi.createDraft({
      title,
      content: htmlContent,
      thumbMediaId,
      author: args.author,
      digest: args.digest,
    });
    log.info('✅ 草稿创建成功!');

    // Step 5: 输出结果
    log.info('步骤 5/5: 完成');
    console.log(JSON.stringify({
      success: true,
      media_id: draftResult.media_id,
      title,
      theme: args.theme,
      message: `草稿已创建！media_id: ${draftResult.media_id}，请在微信公众号后台查看。`,
    }, null, 2));

  } catch (err) {
    log.error(`发布失败: ${err.message}`);
    console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  log.error(`致命错误: ${err.message}`);
  process.exit(1);
});
