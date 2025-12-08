/**
 * 自习室应用的工具函数
 */

/**
 * 防抖函数，限制函数调用频率
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数，限制函数调用频率
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 调用之间的最小时间间隔（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 将秒数格式化为 MM:SS 格式
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * 生成唯一 ID
 * @returns {string} 唯一标识符
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 安全地解析 JSON，失败时返回备用值
 * @param {string} json - 要解析的 JSON 字符串
 * @param {*} fallback - 解析失败时的备用值
 * @returns {*} 解析后的对象或备用值
 */
export function safeJsonParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("JSON 解析失败:", e);
    return fallback;
  }
}

/**
 * 将时间戳格式化为可读时间
 * @param {number} timestamp - Unix 时间戳
 * @returns {string} 格式化的时间字符串
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
