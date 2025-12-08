/**
 * 带错误处理的 LocalStorage 封装
 */

/**
 * 从 localStorage 获取项目
 * @param {string} key - 存储键
 * @param {*} defaultValue - 键不存在时的默认值
 * @returns {*} 存储的值或默认值
 */
export function getItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`从 localStorage 读取时出错 (${key}):`, error);
    return defaultValue;
  }
}

/**
 * 在 localStorage 中设置项目
 * @param {string} key - 存储键
 * @param {*} value - 要存储的值
 * @returns {boolean} 成功状态
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`写入 localStorage 时出错 (${key}):`, error);
    return false;
  }
}

/**
 * 从 localStorage 移除项目
 * @param {string} key - 存储键
 * @returns {boolean} 成功状态
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`从 localStorage 移除时出错 (${key}):`, error);
    return false;
  }
}

/**
 * 清除 localStorage 中的所有项目
 * @returns {boolean} 成功状态
 */
export function clear() {
  try {
    localStorage.clear();
    return true;
  } catch (error) {
    console.error("清除 localStorage 时出错:", error);
    return false;
  }
}
