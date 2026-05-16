#!/usr/bin/env node
/**
 * wechat-api.js — 微信公众号 API 封装
 *
 * 功能：
 * - getAccessToken() — 带缓存（2h），通过 SOCKS5 代理调用
 * - uploadImage(localPath) — 上传图片到微信素材库，返回 CDN URL
 * - uploadMaterial(localPath) — 上传永久素材，返回 media_id
 * - createDraft({title, content, thumbMediaId}) — 创建草稿
 *
 * 所有 HTTP 请求走 socks5://127.0.0.1:12345 代理
 * 使用 https.request + socks-proxy-agent（兼容 Node 22）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { createLogger } = require('./lib/logger');

const log = createLogger('wechat-api');

// ── 配置 ──────────────────────────────────────────────
const PROXY_URL = 'socks5://127.0.0.1:12345';
const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const UPLOAD_BODY_IMG_URL = 'https://api.weixin.qq.com/cgi-bin/media/uploadimg';
const UPLOAD_MATERIAL_URL = 'https://api.weixin.qq.com/cgi-bin/material/add_material';
const DRAFT_URL = 'https://api.weixin.qq.com/cgi-bin/draft/add';

const CREDENTIALS_PATH = '/home/forclaw/.ssh/weixin.json';

// ── 代理 Agent ─────────────────────────────────────────
let _agent = null;
function getAgent() {
  if (!_agent) {
    _agent = new SocksProxyAgent(PROXY_URL);
  }
  return _agent;
}

// ── HTTP 请求封装 ─────────────────────────────────────

/**
 * 发送 GET 请求（走 SOCKS5 代理）
 */
function requestGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      agent: getAgent(),
      headers: { 'Accept': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', err => {
      // 友好错误提示：代理连接失败
      if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
        reject(new Error(`代理连接失败: 无法连接到 ${PROXY_URL}。请确认代理服务已启动。`));
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        reject(new Error('请求超时: 代理连接或 API 响应超时，请检查网络。'));
      } else {
        reject(err);
      }
    });
    req.setTimeout(30000, () => { req.destroy(new Error('请求超时 (30s)')); });
    req.end();
  });
}

/**
 * 发送 POST JSON 请求
 */
function requestPostJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify(bodyObj);

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      agent: getAgent(),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', err => {
      // 友好错误提示：代理连接失败
      if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
        reject(new Error(`代理连接失败: 无法连接到 ${PROXY_URL}。请确认代理服务已启动。`));
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        reject(new Error('请求超时: 代理连接或 API 响应超时，请检查网络。'));
      } else {
        reject(err);
      }
    });
    req.setTimeout(60000, () => { req.destroy(new Error('请求超时 (60s)')); });
    req.end(body);
  });
}

/**
 * 发送 POST multipart 请求（用于文件上传）
 */
function requestPostMultipart(urlStr, fileBuffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;

    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="media"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      '', ''
    ].join('\r\n');
    const footer = `\r\n--${boundary}--\r\n`;
    const fullBody = Buffer.concat([Buffer.from(header), fileBuffer, Buffer.from(footer)]);

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      agent: getAgent(),
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', err => {
      // 友好错误提示：代理连接失败
      if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
        reject(new Error(`代理连接失败: 无法连接到 ${PROXY_URL}。请确认代理服务已启动。`));
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        reject(new Error('上传超时: 代理连接或 API 响应超时，请检查网络或文件大小。'));
      } else {
        reject(err);
      }
    });
    req.setTimeout(120000, () => { req.destroy(new Error('上传超时 (120s)')); });
    req.end(fullBody);
  });
}

// ── Token 缓存 ─────────────────────────────────────────
let _cachedToken = null;
let _tokenExpireAt = 0;

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`凭证文件不存在: ${CREDENTIALS_PATH}`);
  }
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  if (!creds.AppID || !creds.AppSecret) {
    throw new Error('凭证文件缺少 AppID 或 AppSecret');
  }
  return { appId: creds.AppID, appSecret: creds.AppSecret };
}

/**
 * 微信 API 错误码中文说明
 */
function getWechatErrorMessage(errcode, errmsg) {
  const errorMessages = {
    '-1': '系统繁忙，请稍候再试',
    '0': '请求成功',
    '40001': 'AppSecret 错误或不属于该公众账号，请开发者确认 AppID/AppSecret 的正确性',
    '40002': '请确保 grant_type 字段值为 client_credential',
    '40003': '不合法的 OpenID，请开发者确认 OpenID 的有效性',
    '40013': '不合法的 AppID，请开发者确认 AppID 的有效性',
    '40014': '不合法的 access_token，请重新获取',
    '40015': '不合法的菜单类型',
    '40016': '不合法的按钮个数',
    '40017': '不合法的按钮名字长度',
    '40018': '不合法的按钮 KEY 长度',
    '40019': '不合法的按钮 URL 长度',
    '40020': '不合法的按钮版本号',
    '40021': '不合法的菜单版本号',
    '40022': '不合法的子菜单级数',
    '40023': '不合法的子菜单按钮个数',
    '40024': '不合法的子菜单按钮类型',
    '40025': '不合法的子菜单按钮名字长度',
    '40026': '不合法的子菜单按钮 KEY 长度',
    '40027': '不合法的子菜单按钮 URL 长度',
    '40028': '不合法的自定义菜单使用用户',
    '40029': '不合法的 oauth_code',
    '40030': '不合法的 refresh_token',
    '40031': '不合法的 openid 列表',
    '40032': '不合法的 openid 列表长度',
    '40033': '不合法的请求字符，不能包含 unicode 转义格式字符',
    '40035': '不合法的参数',
    '40036': '不合法的模板 id 长度',
    '40037': '模板 id 不正确',
    '40038': '不合法的请求格式',
    '40039': '不合法的 URL 长度',
    '40048': '不合法的子菜单按钮 URL 长度',
    '40066': '不合法的 url',
    '41001': '缺少 access_token 参数',
    '41002': '缺少 appid 参数',
    '41003': '缺少 refresh_token 参数',
    '41004': '缺少 secret 参数',
    '41005': '缺少多媒体文件数据',
    '41006': '缺少 media_id 参数',
    '41007': '缺少子菜单数据',
    '41008': '缺少 oauth code',
    '41009': '缺少 openid',
    '42001': 'access_token 超时，请重新获取',
    '42002': 'refresh_token 超时，请重新获取',
    '42003': 'oauth_code 超时，请重新获取',
    '42007': '用户修改微信密码，accesstoken 和 refreshtoken 失效，需要重新授权',
    '43001': '需要 GET 请求',
    '43002': '需要 POST 请求',
    '43003': '需要 HTTPS 请求',
    '43004': '需要接收者关注',
    '43005': '需要好友关系',
    '43019': '需要将接收者从黑名单中移除',
    '44001': '多媒体文件为空',
    '44002': 'POST 的数据为空',
    '44003': '图文消息内容为空',
    '44004': '文本消息内容为空',
    '45001': '多媒体文件大小超过限制',
    '45002': '消息内容超过限制',
    '45003': '标题字段超过限制',
    '45004': '描述字段超过限制',
    '45005': '链接字段超过限制',
    '45006': '图片链接字段超过限制',
    '45007': '语音播放时间超过限制',
    '45008': '图文消息超过限制',
    '45009': '接口调用超过限制',
    '45010': '创建菜单个数超过限制',
    '45011': 'API 调用太频繁，请稍候再试',
    '45015': '回复时间超过限制',
    '45016': '系统分组，不允许修改',
    '45017': '分组名字过长',
    '45018': '分组数量超过上限',
    '45047': '客服接口下行条数超过上限',
    '46001': '不存在媒体数据',
    '46002': '不存在的菜单版本',
    '46003': '不存在的菜单数据',
    '46004': '不存在的用户',
    '47001': '解析 JSON/XML 内容错误',
    '48001': 'api 功能未授权，请确认公众号已获得该接口权限',
    '48002': '粉丝拒收消息（粉丝在公众号选项中，关闭了“接收消息”）',
    '48003': 'api 功能未授权，请确认公众号已获得该接口权限',
    '48004': 'api 接口被封禁，请检查公众号是否因违规被封禁',
    '48005': 'api 禁止删除被自动设置和开发模式设置的菜单',
    '48006': 'api 禁止清零',
    '49003': '传入的 openid 非法',
    '49008': '该公众号已经在其他地方授权，当前操作取消',
    '50001': '用户未授权该 api',
    '50002': '用户受限，可能是违规后接口被封禁',
    '50005': '用户未关注公众号',
    '40090': '无效的 jobid',
    '40090': '不合法的 lat/long 位置坐标',
    '45056': '创建的标签数过多',
    '45058': '标签名字长度超过 30 个字节',
    '45059': '标签名已存在',
    '45157': '标签名非法，请注意不能使用特殊字符',
    '45158': '标签名长度超过 30 个字节',
    '45056': '该公众号的标签个数已达上限',
    '40090': 'IP 不在白名单内，请确认出口 IP 已在微信公众号后台配置白名单',
    '87009': '别名不合法',
    '88000': '没有留言权限',
  };

  const msg = errorMessages[String(errcode)];
  return msg ? `[${errcode}] ${msg}` : `[${errcode}] ${errmsg}`;
}

async function fetchAccessToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpireAt) {
    return _cachedToken;
  }

  const { appId, appSecret } = loadCredentials();
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

  const data = await requestGet(url);

  if (data.errcode) {
    throw new Error(`Token 获取失败: ${getWechatErrorMessage(data.errcode, data.errmsg)}`);
  }
  if (!data.access_token) {
    throw new Error('响应中无 access_token');
  }

  // 缓存 token，提前 5 分钟过期
  _cachedToken = data.access_token;
  _tokenExpireAt = now + (data.expires_in || 7200) * 1000 - 300000;

  log.info(`Token 获取成功: ${data.access_token.substring(0, 20)}...`);
  return _cachedToken;
}

// ── 图片上传 ───────────────────────────────────────────

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.bmp': 'image/bmp',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * 上传正文图片 → 返回微信 CDN URL
 */
async function uploadImage(localPath) {
  const accessToken = await fetchAccessToken();

  if (!fs.existsSync(localPath)) {
    throw new Error(`图片文件不存在: ${localPath}`);
  }

  const fileBuffer = fs.readFileSync(localPath);
  const filename = path.basename(localPath);
  const contentType = getMimeType(localPath);

  const data = await requestPostMultipart(
    `${UPLOAD_BODY_IMG_URL}?access_token=${accessToken}`,
    fileBuffer, filename, contentType
  );

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`上传正文图片失败: ${getWechatErrorMessage(data.errcode, data.errmsg)}`);
  }

  let url_ret = data.url || '';
  if (url_ret.startsWith('http://')) {
    url_ret = url_ret.replace(/^http:\/\//i, 'https://');
  }

  log.info(`图片上传成功: ${filename} → ${url_ret}`);
  return url_ret;
}

/**
 * 上传永久素材（封面图等）→ 返回 media_id + url
 */
async function uploadMaterial(localPath) {
  const accessToken = await fetchAccessToken();

  if (!fs.existsSync(localPath)) {
    throw new Error(`文件不存在: ${localPath}`);
  }

  const fileBuffer = fs.readFileSync(localPath);
  const filename = path.basename(localPath);
  const contentType = getMimeType(localPath);

  const data = await requestPostMultipart(
    `${UPLOAD_MATERIAL_URL}?type=image&access_token=${accessToken}`,
    fileBuffer, filename, contentType
  );

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`上传素材失败: ${getWechatErrorMessage(data.errcode, data.errmsg)}`);
  }

  let url_ret = data.url || '';
  if (url_ret.startsWith('http://')) {
    url_ret = url_ret.replace(/^http:\/\//i, 'https://');
  }

  log.info(`素材上传成功: ${filename} → media_id=${data.media_id}`);
  return { media_id: data.media_id, url: url_ret };
}

// ── 草稿创建 ───────────────────────────────────────────

/**
 * 创建草稿
 * @param {Object} opts
 * @param {string} opts.title - 文章标题
 * @param {string} opts.content - HTML 正文（内联样式）
 * @param {string} [opts.thumbMediaId] - 封面 media_id（可选）
 * @param {string} [opts.author] - 作者
 * @param {string} [opts.digest] - 摘要
 * @returns {Promise<{media_id: string}>}
 */
async function createDraft(opts) {
  const accessToken = await fetchAccessToken();

  const article = {
    article_type: 'news',
    title: opts.title,
    content: opts.content,
    need_open_comment: opts.needOpenComment ?? 1,
    only_fans_can_comment: opts.onlyFansCanComment ?? 0,
  };

  if (opts.thumbMediaId) article.thumb_media_id = opts.thumbMediaId;

  if (opts.author) article.author = opts.author;
  if (opts.digest) article.digest = opts.digest;

  const data = await requestPostJson(`${DRAFT_URL}?access_token=${accessToken}`, {
    articles: [article],
  });

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`创建草稿失败: ${getWechatErrorMessage(data.errcode, data.errmsg)}`);
  }

  log.info(`草稿创建成功! media_id: ${data.media_id}`);
  return { media_id: data.media_id };
}

// ── 导出 ───────────────────────────────────────────────
module.exports = {
  fetchAccessToken,
  uploadImage,
  uploadMaterial,
  createDraft,
  loadCredentials,
  getWechatErrorMessage,
  PROXY_URL,
};

// ── CLI 模式（用于测试）─────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test-token')) {
    fetchAccessToken()
      .then(token => { console.log(JSON.stringify({ success: true, token: token.substring(0, 20) + '...', expiresAt: new Date(_tokenExpireAt).toISOString() }, null, 2)); })
      .catch(err => { console.error(JSON.stringify({ success: false, error: err.message }, null, 2)); process.exit(1); });
  } else if (args.includes('--test-upload')) {
    const imgPath = args.find((a, i) => args[i - 1] === '--test-upload') || args.find(a => !a.startsWith('-'));
    if (!imgPath) { console.log('请指定图片路径'); process.exit(1); }
    uploadImage(imgPath)
      .then(url => { console.log(JSON.stringify({ success: true, url }, null, 2)); })
      .catch(err => { console.error(JSON.stringify({ success: false, error: err.message }, null, 2)); process.exit(1); });
  } else {
    console.log(`
wechat-api.js — 微信公众号 API 封装

用法:
  node wechat-api.js --test-token              # 测试获取 access_token
  node wechat-api.js --test-upload <图片路径>   # 测试上传图片

API 导出:
  fetchAccessToken()       → Promise<string>   获取带缓存的 access_token
  uploadImage(localPath)   → Promise<string>   上传正文图片，返回 CDN URL
  uploadMaterial(localPath)→ Promise<{media_id, url}>  上传永久素材
  createDraft(opts)        → Promise<{media_id}>  创建草稿
  loadCredentials()        → {appId, appSecret}
`);
  }
}
