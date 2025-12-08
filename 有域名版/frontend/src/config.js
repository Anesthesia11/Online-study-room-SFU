/**
 * 应用程序配置
 */

const config = {
  // API 端点
  wsBase: import.meta.env.VITE_WS_BASE || "ws://127.0.0.1:8000",
  httpBase: import.meta.env.VITE_HTTP_BASE || "http://127.0.0.1:8000",
  livekitTokenEndpoint: import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || "http://127.0.0.1:8000/sfu/token",

  // 媒体约束
  mediaConstraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 20, max: 30 },
    },
    screen: {
      frameRate: { ideal: 20, max: 30 },
    },
  },

  // UI 设置
  maxChatMessages: 50,
  maxEventMessages: 20,
  debounceDelay: 300,
  throttleDelay: 1000,

  // 存储键
  storageKeys: {
    theme: "study-room-theme",
    username: "study-room-username",
    goals: (roomId) => `study-room-goals-${roomId}`,
  },
};

export default config;
