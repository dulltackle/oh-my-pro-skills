/**
 * 简易日志工具
 *
 * 格式：[时间] [LEVEL] [模块名] 消息
 * info/warn/error 均输出到 stderr（不影响 JSON stdout 输出）
 */

const LEVELS = { info: 'INFO', warn: 'WARN', error: 'ERROR' };

/**
 * 创建带模块名的日志函数
 * @param {string} module - 模块名称（如 'publish-api', 'wechat-api'）
 * @returns {{ info: Function, warn: Function, error: Function }}
 */
function createLogger(module) {
  return {
    info(msg) {
      stderrLog('info', module, msg);
    },
    warn(msg) {
      stderrLog('warn', module, msg);
    },
    error(msg) {
      stderrLog('error', module, msg);
    },
  };
}

function stderrLog(level, module, msg) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stderr.write(`[${now}] [${LEVELS[level]}] [${module}] ${msg}\n`);
}

module.exports = { createLogger };
