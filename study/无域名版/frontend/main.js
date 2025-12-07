
import {
  ConnectionState,
  LogLevel,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  createLocalScreenTracks,
  createLocalVideoTrack,
  setLogLevel,
} from "https://cdn.jsdelivr.net/npm/livekit-client@2.5.3/dist/livekit-client.esm.mjs";

setLogLevel(LogLevel.warn);

const goalAddBtn = document.getElementById("goal-add-btn");
const goalDeleteBtn = document.getElementById("goal-delete-btn");
const goalExpandBtn = document.getElementById("goal-expand-btn");
const goalListEl = document.getElementById("goal-list");
const goalContainer = document.querySelector(".goal-list-container");
const goalEmptyHint = document.getElementById("goal-empty-hint");
const leaveBtn = document.getElementById("leave-btn");
const sessionUserEl = document.getElementById("session-user");
const roomTitleEl = document.getElementById("room-title");
const themeToggle = document.getElementById("theme-toggle");
const focusLengthInput = document.getElementById("focus-length");
const breakLengthInput = document.getElementById("break-length");
const timerDisplay = document.getElementById("timer-display");
const timerStatus = document.getElementById("timer-status");
const participantsList = document.getElementById("participants");
const eventsList = document.getElementById("events");
const chatList = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const actionButtons = document.querySelectorAll(".actions button");
const mediaGrid = document.getElementById("media-grid");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screen-btn");
const leaderboardList = document.getElementById("leaderboard");

let socket = null;
let lastState = null;
let localUser = "";
let remoteMediaStates = {};

let livekitRoom = null;
let livekitConnectPromise = null;
let livekitTokenInfo = null;
const localTracks = { audio: null, video: null, screen: null };
const localPublications = { audio: null, video: null, screen: null };

const mediaTiles = new Map();
const mediaState = { audio: false, video: false, screen: false };
const tileVisibility = new Map();
let pageFullTileUser = "";
let fullscreenOwner = "";

if (document.body) {
  document.body.dataset.pageFull = "false";
}

const JOIN_SESSION_KEY = "studyRoomJoin";
const THEME_KEY = "studyRoomTheme";
const LEADERBOARD_PREFIX = "studyRoomLeaderboard:";
const GOAL_STORAGE_PREFIX = "studyRoomGoals:";
let currentRoomId = "";
let currentUserName = "";
// 根据需要替换成自己的后端地址
// 动态选择 WebSocket 地址：本地开发使用 localhost，生产环境使用域名
const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.");

// 可通过 window.__STUDY_ROOM_CONFIG__ 在部署时覆盖网络地址
const studyRoomConfig = window.__STUDY_ROOM_CONFIG__ || {};
const remoteWsDefault = (() => {
  const { protocol, host } = window.location;
  if (!host) {
    return "wss://api.zjbstudy.top";
  }
  const scheme = protocol === "https:" ? "wss://" : "ws://";
  return `${scheme}${host}`;
})();
const rawWsBase =
  studyRoomConfig.wsBase ||
  (isLocalhost ? "ws://localhost:8000" : remoteWsDefault);
const wsBase = rawWsBase.replace(/\/$/, "");
const httpBase =
  studyRoomConfig.httpBase ||
  (wsBase.startsWith("wss://")
    ? `https://${wsBase.slice(6)}`
    : wsBase.startsWith("ws://")
      ? `http://${wsBase.slice(5)}`
      : window.location.origin);
const LIVEKIT_TOKEN_ENDPOINT =
  studyRoomConfig.livekitTokenEndpoint || `${httpBase}/sfu/token`;
const LIVEKIT_TOKEN_REFRESH_MARGIN = 30; // seconds
const LIVEKIT_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  stopLocalTrackOnUnpublish: true,
};

const MEDIA_FRAME_RATE = 20;
const CAMERA_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: MEDIA_FRAME_RATE, max: MEDIA_FRAME_RATE },
};
const SCREEN_VIDEO_CONSTRAINTS = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: MEDIA_FRAME_RATE, max: MEDIA_FRAME_RATE },
};

let currentTheme = "dark";
let timerCycle = "focus";
let timerStatusState = "idle";
let timerRemaining = 0;
let timerIntervalId = null;
let timerLastTick = null;
let currentFocusPlanned = 0;
let focusSessionActive = false;
let leaderboardTotals = {};
let goals = [];
let goalStorageKey = "";
let goalDeleteMode = false;
let pendingGoalFocusId = "";
let leaderboardStorageKey = "";

function applyTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  if (currentTheme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  if (themeToggle) {
    themeToggle.textContent = currentTheme === "dark" ? "切换浅色模式" : "切换暗夜模式";
  }
  try {
    localStorage.setItem(THEME_KEY, currentTheme);
  } catch (_) {
    /* ignore */
  }
}

try {
  const params = new URLSearchParams(window.location.search);
  const paramTheme = params.get("theme");
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (paramTheme) {
    currentTheme = paramTheme;
  } else if (storedTheme) {
    currentTheme = storedTheme;
  }
} catch (_) {
  currentTheme = "dark";
}
applyTheme(currentTheme);

function getDurationSeconds(kind) {
  const input = kind === "focus" ? focusLengthInput : breakLengthInput;
  if (!input) {
    return (kind === "focus" ? 25 : 5) * 60;
  }
  const value = parseInt(input.value, 10);
  if (Number.isNaN(value) || value <= 0) {
    return (kind === "focus" ? 25 : 5) * 60;
  }
  return Math.min(value, kind === "focus" ? 300 : 180) * 60;
}

function updateTimerUI() {
  timerDisplay.textContent = formatSeconds(Math.max(0, timerRemaining));
  const statusText =
    timerStatusState === "running"
      ? "运行中"
      : timerStatusState === "paused"
        ? "已暂停"
        : "待开始";
  timerStatus.textContent = `${timerCycle === "focus" ? "专注" : "休息"} · ${statusText}`;
  const pauseButton = document.querySelector('button[data-action="pause"]');
  if (pauseButton) {
    pauseButton.textContent = timerStatusState === "paused" ? "继续" : "暂停";
  }
}

function initLocalTimer() {
  timerCycle = "focus";
  timerStatusState = "idle";
  timerRemaining = getDurationSeconds("focus");
  currentFocusPlanned = timerRemaining;
  focusSessionActive = false;
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerLastTick = null;
  updateTimerUI();
}

function startLocalTimer(cycle) {
  timerCycle = cycle;
  timerRemaining = getDurationSeconds(cycle);
  if (cycle === "focus") {
    currentFocusPlanned = timerRemaining;
    focusSessionActive = true;
  } else {
    focusSessionActive = false;
    currentFocusPlanned = 0;
  }
  timerStatusState = "running";
  timerLastTick = Date.now();
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
  }
  timerIntervalId = window.setInterval(tickLocalTimer, 500);
  logItem(eventsList, `${cycle === "focus" ? "开始专注" : "开始休息"}（个人）`);
  updateTimerUI();
}

function resumeLocalTimer() {
  if (timerStatusState !== "paused") return;
  timerStatusState = "running";
  timerLastTick = Date.now();
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
  }
  timerIntervalId = window.setInterval(tickLocalTimer, 500);
  logItem(eventsList, "继续计时（个人）");
  updateTimerUI();
}

function pauseLocalTimer() {
  if (timerStatusState !== "running") return;
  timerStatusState = "paused";
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  updateTimerUI();
}

function resetLocalTimer() {
  finalizeFocusSession();
  initLocalTimer();
  logItem(eventsList, "个人计时器已重置");
}

function skipLocalBreak() {
  if (timerCycle !== "break") return;
  logItem(eventsList, "跳过休息，重新进入专注");
  startLocalTimer("focus");
}

function tickLocalTimer() {
  if (timerStatusState !== "running") return;
  const now = Date.now();
  const delta = Math.floor((now - timerLastTick) / 1000);
  if (delta <= 0) {
    return;
  }
  timerLastTick = now;
  timerRemaining = Math.max(0, timerRemaining - delta);
  updateTimerUI();
  if (timerRemaining <= 0) {
    completeLocalCycle();
  }
}

function completeLocalCycle() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  if (timerCycle === "focus") {
    finalizeFocusSession();
    logItem(eventsList, "专注完成，自动进入休息");
    startLocalTimer("break");
  } else {
    logItem(eventsList, "休息结束，回到待开始状态");
    timerCycle = "focus";
    timerStatusState = "idle";
    timerRemaining = getDurationSeconds("focus");
    currentFocusPlanned = timerRemaining;
    focusSessionActive = false;
    updateTimerUI();
  }
}

function finalizeFocusSession() {
  if (!focusSessionActive || timerCycle !== "focus") {
    focusSessionActive = false;
    return;
  }
  const planned = currentFocusPlanned || 0;
  if (planned <= 0) {
    focusSessionActive = false;
    return;
  }
  const elapsed = planned - timerRemaining;
  const effective = Math.max(0, Math.min(planned, elapsed));
  if (effective > 0) {
    addLeaderboardDuration(getLeaderboardUser(), effective);
  }
  focusSessionActive = false;
}

function readJoinPayload() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("room") || params.has("name") || params.has("goal")) {
    return {
      room: params.get("room") || "",
      name: params.get("name") || "",
      goal: params.get("goal") || "",
    };
  }
  try {
    const stored = sessionStorage.getItem(JOIN_SESSION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function updateSessionMeta() {
  if (sessionUserEl) {
    sessionUserEl.textContent = currentUserName || "-";
  }
  if (roomTitleEl) {
    roomTitleEl.textContent = currentRoomId ? `房间：${currentRoomId}` : "线上自习室";
  }
}

const initialJoin = readJoinPayload();
if (!initialJoin || !initialJoin.room || !initialJoin.name) {
  window.location.replace("join.html");
} else {
  currentRoomId = initialJoin.room.trim();
  currentUserName = initialJoin.name.trim();
  setGoalContext(currentRoomId, currentUserName);
  seedInitialGoal(initialJoin.goal || "");
  updateSessionMeta();
  setLeaderboardRoom(currentRoomId);
}

function formatSeconds(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(Math.floor(total % 60)).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function generateGoalId() {
  return `goal-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function setGoalContext(roomId, user) {
  const sanitizedRoom = (roomId || "").trim();
  const sanitizedUser = (user || "").trim();
  const nextKey = sanitizedRoom && sanitizedUser ? `${GOAL_STORAGE_PREFIX}${sanitizedRoom}:${sanitizedUser}` : "";
  if (goalStorageKey === nextKey) {
    return;
  }
  goalStorageKey = nextKey;
  loadGoalsFromStorage();
}

function loadGoalsFromStorage() {
  goals = [];
  if (!goalStorageKey) {
    renderGoals();
    return;
  }
  try {
    const raw = localStorage.getItem(goalStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        goals = parsed
          .map((entry) => ({
            id: typeof entry.id === "string" ? entry.id : generateGoalId(),
            text: typeof entry.text === "string" ? entry.text : "",
            completed: Boolean(entry.completed),
          }))
          .slice(0, 200);
      }
    }
  } catch (_) {
    goals = [];
  }
  renderGoals();
}

function persistGoals() {
  if (!goalStorageKey) return;
  try {
    localStorage.setItem(
      goalStorageKey,
      JSON.stringify(
        goals.map((goal) => ({
          id: goal.id,
          text: goal.text,
          completed: goal.completed,
        })),
      ),
    );
  } catch (_) {
    /* ignore */
  }
}

function renderGoals() {
  if (!goalListEl || !goalContainer) return;
  goalListEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  goals.forEach((goal) => {
    const li = document.createElement("li");
    li.className = "goal-item";
    li.dataset.id = goal.id;
    li.dataset.complete = String(goal.completed);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "goal-remove";
    removeBtn.dataset.id = goal.id;
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "删除目标");
    removeBtn.hidden = !goalDeleteMode;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "goal-text";
    input.placeholder = "写下目标...";
    input.value = goal.text;
    input.dataset.id = goal.id;
    input.dataset.complete = String(goal.completed);

    const controls = document.createElement("div");
    controls.className = "goal-controls";

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "goal-check";
    checkBtn.dataset.id = goal.id;
    checkBtn.dataset.complete = String(goal.completed);
    checkBtn.setAttribute("aria-label", goal.completed ? "取消完成" : "标记完成");

    controls.append(checkBtn);
    li.append(removeBtn, input, controls);
    fragment.appendChild(li);
  });
  goalListEl.appendChild(fragment);
  goalContainer.dataset.empty = String(goals.length === 0);
  goalContainer.dataset.deleteMode = String(goalDeleteMode && goals.length > 0);
  if (goalEmptyHint) {
    goalEmptyHint.hidden = goals.length > 0;
  }
  updateGoalUtilityButtons();
  focusPendingGoalInput();
}

function updateGoalUtilityButtons() {
  if (goalDeleteBtn) {
    const hasGoals = goals.length > 0;
    goalDeleteBtn.disabled = !hasGoals;
    goalDeleteBtn.hidden = !hasGoals;
    goalDeleteBtn.dataset.active = String(goalDeleteMode);
  }
  if (goalExpandBtn && goalContainer) {
    const shouldShow = goals.length > 3;
    goalExpandBtn.hidden = !shouldShow;
    if (!shouldShow) {
      goalContainer.dataset.expanded = "false";
    }
    const expanded = goalContainer.dataset.expanded === "true";
    goalExpandBtn.textContent = expanded ? "收起" : "展开全部";
  }
}

function focusPendingGoalInput() {
  if (!pendingGoalFocusId || !goalListEl) return;
  const targetInput = goalListEl.querySelector(`.goal-text[data-id="${pendingGoalFocusId}"]`);
  pendingGoalFocusId = "";
  if (targetInput) {
    targetInput.focus();
    targetInput.select();
  }
}

function addGoalItem(initialText = "", { focus = true } = {}) {
  const newGoal = {
    id: generateGoalId(),
    text: initialText,
    completed: false,
  };
  goals.push(newGoal);
  persistGoals();
  pendingGoalFocusId = focus && !initialText ? newGoal.id : "";
  renderGoals();
}

function seedInitialGoal(text) {
  const value = (text || "").trim();
  if (!value || goals.length > 0) return;
  addGoalItem(value, { focus: false });
}

function updateGoalText(goalId, text) {
  const target = goals.find((goal) => goal.id === goalId);
  if (!target) return;
  target.text = text.slice(0, 140);
  persistGoals();
}

function toggleGoalComplete(goalId) {
  const target = goals.find((goal) => goal.id === goalId);
  if (!target) return;
  target.completed = !target.completed;
  persistGoals();
  renderGoals();
}

function removeGoal(goalId) {
  const next = goals.filter((goal) => goal.id !== goalId);
  if (next.length === goals.length) return;
  goals = next;
  if (!goals.length) {
    goalDeleteMode = false;
  }
  persistGoals();
  renderGoals();
}

function toggleGoalDeleteMode() {
  if (!goals.length) {
    goalDeleteMode = false;
    updateGoalUtilityButtons();
    return;
  }
  goalDeleteMode = !goalDeleteMode;
  renderGoals();
}

function toggleGoalExpanded() {
  if (!goalContainer || !goalExpandBtn) return;
  const next = goalContainer.dataset.expanded !== "true";
  goalContainer.dataset.expanded = String(next);
  goalExpandBtn.textContent = next ? "收起" : "展开全部";
}

function handleGoalListInput(event) {
  const target = event.target;
  if (!target.classList.contains("goal-text")) return;
  const goalId = target.dataset.id;
  updateGoalText(goalId, target.value);
}

function handleGoalListKey(event) {
  if (event.key !== "Enter") return;
  if (!event.target.classList.contains("goal-text")) return;
  event.preventDefault();
  event.target.blur();
}

function handleGoalListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.classList.contains("goal-check")) {
    const goalId = target.dataset.id;
    toggleGoalComplete(goalId);
    return;
  }
  if (target.classList.contains("goal-remove")) {
    const goalId = target.dataset.id;
    removeGoal(goalId);
  }
}

if (goalAddBtn) {
  goalAddBtn.addEventListener("click", () => {
    addGoalItem();
  });
}

if (goalDeleteBtn) {
  goalDeleteBtn.addEventListener("click", () => {
    toggleGoalDeleteMode();
  });
}

if (goalExpandBtn) {
  goalExpandBtn.addEventListener("click", () => {
    toggleGoalExpanded();
  });
}

if (goalListEl) {
  goalListEl.addEventListener("input", handleGoalListInput);
  goalListEl.addEventListener("keydown", handleGoalListKey);
  goalListEl.addEventListener("click", handleGoalListClick);
}

function getLeaderboardUser() {
  const name = (localUser || currentUserName || "").trim();
  return name || "未命名";
}

function setLeaderboardRoom(roomId) {
  leaderboardStorageKey = roomId ? `${LEADERBOARD_PREFIX}${roomId}` : "";
  leaderboardTotals = {};
  if (leaderboardStorageKey) {
    try {
      const raw = localStorage.getItem(leaderboardStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.entries(parsed).forEach(([user, value]) => {
            const seconds = Number(value);
            if (!Number.isNaN(seconds) && seconds > 0) {
              leaderboardTotals[user] = seconds;
            }
          });
        }
      }
    } catch (_) {
      leaderboardTotals = {};
    }
  }
  renderLeaderboard();
}

function persistLeaderboard() {
  if (!leaderboardStorageKey) return;
  try {
    localStorage.setItem(leaderboardStorageKey, JSON.stringify(leaderboardTotals));
  } catch (_) {
    /* ignore */
  }
}

function renderLeaderboard() {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  const entries = Object.entries(leaderboardTotals);
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.textContent = "暂无番茄钟记录";
    leaderboardList.appendChild(empty);
    return;
  }
  entries
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, seconds], index) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${index + 1}. ${name}`;
      const value = document.createElement("span");
      value.textContent = `| ${formatSeconds(Math.max(0, Math.floor(seconds)))}`;
      li.append(label, value);
      leaderboardList.appendChild(li);
    });
}

function addLeaderboardDuration(user, seconds) {
  const normalized = Math.max(0, Math.floor(seconds || 0));
  if (!user || normalized <= 0) return;
  const key = user.trim() || "未命名";
  leaderboardTotals[key] = (leaderboardTotals[key] || 0) + normalized;
  persistLeaderboard();
  renderLeaderboard();
}

function clearLeaderboardUser(user) {
  const key = (user || "").trim();
  if (!key) return;
  if (leaderboardTotals[key]) {
    delete leaderboardTotals[key];
    persistLeaderboard();
    renderLeaderboard();
  }
}

function logItem(listEl, text) {
  if (!listEl) return;
  const li = document.createElement("li");
  li.textContent = text;
  listEl.prepend(li);
  if (listEl.childElementCount > 50) {
    listEl.removeChild(listEl.lastChild);
  }
}

function notifyExclusiveMedia(kind) {
  const message =
    kind === "camera"
      ? "屏幕分享已开启，请先关闭屏幕分享再打开摄像头。"
      : "摄像头已开启，请先关闭摄像头再开始屏幕分享。";
  logItem(eventsList, message);
}

function renderState(state) {
  lastState = state;

  if (participantsList) {
    participantsList.innerHTML = "";
  }
  state.participants.forEach((name) => {
    if (participantsList) {
      const li = document.createElement("li");
      li.textContent = name;
      participantsList.appendChild(li);
    }
    ensureMediaTile(name);
  });

  pruneMediaTiles(state.participants);

  const mediaStates = state.media_states || {};
  Object.entries(mediaStates).forEach(([user, details]) => {
    updateRemoteMedia(user, details);
  });

}

function setControlsEnabled(enabled) {
  actionButtons.forEach((btn) => {
    btn.disabled = !enabled;
  });
  chatInput.disabled = !enabled;
  if (focusLengthInput) focusLengthInput.disabled = !enabled;
  if (breakLengthInput) breakLengthInput.disabled = !enabled;
  setMediaButtonsEnabled(enabled);
}

function setMediaButtonsEnabled(enabled) {
  [micBtn, camBtn, screenBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = !enabled;
  });
  setMediaButtonsState();
}

function sendMessage(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

async function ensureRoomExists(roomId) {
  if (!roomId) {
    return;
  }
  const payload = {
    room_id: roomId,
    goal: goals[0]?.text || "",
    timer_length: getDurationSeconds("focus"),
    break_length: getDurationSeconds("break"),
  };
  try {
    const resp = await fetch(`${httpBase}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch (error) {
    logItem(eventsList, `房间创建失败：${error?.message || error}`);
  }
}

async function connectRoom() {
  if (socket) {
    socket.close();
  }
  disconnectLivekit();
  livekitTokenInfo = null;

  const roomId = currentRoomId;
  if (!roomId) {
    timerStatus.textContent = "请先填写房间 ID";
    window.location.replace("join.html");
    return;
  }
  const user = currentUserName || "访客";
  if (!user) {
    timerStatus.textContent = "请先填写昵称";
    window.location.replace("join.html");
    return;
  }
  if (localUser && localUser !== user) {
    removeMediaTile(localUser);
  }
  localUser = user;
  setGoalContext(currentRoomId, localUser);
  remoteMediaStates = {};
  ensureMediaTile(user);
  updateLocalTile();

  await ensureRoomExists(roomId);

  const wsUrl = `${wsBase}/ws/rooms/${encodeURIComponent(roomId)}`;
  socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    timerStatus.textContent = "连接成功";
    sendMessage({ type: "join", user });
    setControlsEnabled(true);
    leaveBtn.disabled = false;
    sendMediaUpdate();
    connectLivekit()
      .then(() => {
        logItem(eventsList, "LiveKit 已连接");
      })
      .catch((error) => {
        logItem(eventsList, `LiveKit 连接失败：${error?.message || error}`);
      });
  });

  socket.addEventListener("message", async (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "state":
        renderState(data.data);
        break;
      case "chat":
        logItem(chatList, `${data.user || "匿名"}: ${data.text}`);
        break;
      case "event":
        logItem(eventsList, data.event + (data.user ? ` (${data.user})` : ""));
        break;
      case "media:update":
        updateRemoteMedia(data.user, data.media || {});
        break;
      default:
        break;
    }
  });

  socket.addEventListener("close", () => {
    timerStatus.textContent = "已断开";
    setControlsEnabled(false);
    leaveBtn.disabled = true;
    cleanupMediaTiles();
    stopAllMedia()
      .catch(() => {})
      .finally(() => {
        disconnectLivekit();
        livekitTokenInfo = null;
      });
  });

  socket.addEventListener("error", () => {
    timerStatus.textContent = "连接出错";
  });
}

function ensureMediaTile(user) {
  if (!mediaGrid || mediaTiles.has(user)) {
    return mediaTiles.get(user);
  }
  getTilePrefs(user);
  const tile = document.createElement("article");
  tile.className = "media-tile";
  tile.dataset.user = user;

  const header = document.createElement("div");
  header.className = "media-tile__header";
  const titleWrap = document.createElement("div");
  titleWrap.className = "media-tile__title";
  const nameEl = document.createElement("strong");
  nameEl.textContent = user;
  const statusEl = document.createElement("span");
  statusEl.className = "media-tile__status";
  statusEl.textContent = "未开启设备";
  titleWrap.append(nameEl, statusEl);

  const viewActions = document.createElement("div");
  viewActions.className = "media-tile__actions";
  const pageFullBtn = document.createElement("button");
  pageFullBtn.type = "button";
  pageFullBtn.className = "media-view-btn";
  pageFullBtn.dataset.active = "false";
  pageFullBtn.textContent = "网页全屏";
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "media-view-btn";
  fullscreenBtn.dataset.active = "false";
  fullscreenBtn.textContent = "全屏";
  viewActions.append(pageFullBtn, fullscreenBtn);
  header.append(titleWrap, viewActions);

  const cameraVideo = document.createElement("video");
  cameraVideo.autoplay = true;
  cameraVideo.playsInline = true;
  cameraVideo.hidden = true;
  cameraVideo.dataset.kind = "camera";
  if (user === localUser) {
    cameraVideo.muted = true;
  }

  const screenVideo = document.createElement("video");
  screenVideo.autoplay = true;
  screenVideo.playsInline = true;
  screenVideo.hidden = true;
  screenVideo.dataset.kind = "screen";
  if (user === localUser) {
    screenVideo.muted = true;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "media-placeholder";
  placeholder.textContent = "暂无画面";

  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  audioEl.hidden = true;

  const toggleBar = document.createElement("div");
  toggleBar.className = "media-tile__toggles";
  const cameraToggle = document.createElement("button");
  cameraToggle.type = "button";
  cameraToggle.className = "media-toggle";
  cameraToggle.dataset.kind = "camera";
  cameraToggle.dataset.active = "true";
  cameraToggle.textContent = "摄像头";
  const screenToggle = document.createElement("button");
  screenToggle.type = "button";
  screenToggle.className = "media-toggle";
  screenToggle.dataset.kind = "screen";
  screenToggle.dataset.active = "true";
  screenToggle.textContent = "屏幕";
  toggleBar.append(cameraToggle, screenToggle);

  tile.append(header, toggleBar, cameraVideo, screenVideo, placeholder, audioEl);
  mediaGrid.appendChild(tile);

  [cameraVideo, screenVideo].forEach((video) => {
    video.addEventListener("click", () => {
      tile.classList.toggle("expanded");
    });
  });

  pageFullBtn.addEventListener("click", () => {
    togglePageFullscreen(user);
  });
  fullscreenBtn.addEventListener("click", () => {
    toggleNativeFullscreen(user);
  });
  cameraToggle.addEventListener("click", () => {
    toggleTileSection(user, "camera");
  });
  screenToggle.addEventListener("click", () => {
    toggleTileSection(user, "screen");
  });

  const info = {
    tile,
    statusEl,
    cameraVideo,
    screenVideo,
    placeholder,
    audioEl,
    cameraToggle,
    screenToggle,
    pageFullBtn,
    fullscreenBtn,
  };
  mediaTiles.set(user, info);
  applyTileVisibility(user);
  updatePageFullscreenButtons();
  updateFullscreenButtons();
  return info;
}

function removeMediaTile(user) {
  const info = mediaTiles.get(user);
  if (!info) return;
  if (pageFullTileUser === user) {
    exitPageFullscreen();
  }
  if (fullscreenOwner === user && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  if (fullscreenOwner === user) {
    fullscreenOwner = "";
  }
  if (info.cameraVideo.srcObject) {
    info.cameraVideo.srcObject = null;
  }
  if (info.screenVideo.srcObject) {
    info.screenVideo.srcObject = null;
  }
  if (info.audioEl.srcObject) {
    info.audioEl.pause();
    info.audioEl.srcObject = null;
  }
  info.tile.remove();
  mediaTiles.delete(user);
  tileVisibility.delete(user);
  updatePageFullscreenButtons();
  updateFullscreenButtons();
}

function updateTileStatus(user, state) {
  const info = ensureMediaTile(user);
  if (!info) return;
  const flags = [];
  if (state?.audio) flags.push("麦克风");
  if (state?.video) flags.push("摄像头");
  if (state?.screen) flags.push("屏幕");
  info.statusEl.textContent = flags.length ? `${flags.join(" / ")} 已开启` : "未开启设备";
}

function updateRemoteMedia(user, state = {}) {
  remoteMediaStates[user] = state;
  updateTileStatus(user, state);
  applyTileVisibility(user);
}

function pruneMediaTiles(participants) {
  const keep = new Set(participants);
  keep.add(localUser);
  Array.from(mediaTiles.keys()).forEach((user) => {
    if (!keep.has(user)) {
      removeMediaTile(user);
      delete remoteMediaStates[user];
    }
  });
}

function setMediaButtonsState() {
  if (micBtn) {
    micBtn.dataset.active = String(mediaState.audio);
    micBtn.textContent = mediaState.audio ? "麦克风已开启" : "麦克风已关闭";
    micBtn.title = "";
  }
  if (camBtn) {
    camBtn.dataset.active = String(mediaState.video);
    camBtn.textContent = mediaState.video ? "摄像头已开启" : "摄像头已关闭";
    camBtn.title = !mediaState.video && mediaState.screen ? "正在分享屏幕，无法同时开启摄像头" : "";
  }
  if (screenBtn) {
    screenBtn.dataset.active = String(mediaState.screen);
    screenBtn.textContent = mediaState.screen ? "正在分享屏幕" : "未分享屏幕";
    screenBtn.title = !mediaState.screen && mediaState.video ? "摄像头已开启，无法同时分享屏幕" : "";
  }
}

function getTilePrefs(user) {
  if (!tileVisibility.has(user)) {
    tileVisibility.set(user, { camera: true, screen: true });
  }
  return tileVisibility.get(user);
}

function toggleTileSection(user, kind) {
  const prefs = getTilePrefs(user);
  prefs[kind] = !prefs[kind];
  applyTileVisibility(user);
}

function hasActiveStream(videoEl) {
  const stream = videoEl.srcObject;
  if (!stream) return false;
  return stream.getTracks().some((track) => track.readyState === "live");
}

function applyTileVisibility(user) {
  const info = mediaTiles.get(user);
  if (!info) return;
  const prefs = getTilePrefs(user);
  const cameraStream = hasActiveStream(info.cameraVideo);
  const screenStream = hasActiveStream(info.screenVideo);

  const showCamera = prefs.camera && cameraStream;
  const showScreen = prefs.screen && screenStream;

  info.cameraVideo.hidden = !showCamera;
  info.screenVideo.hidden = !showScreen;

  if (info.cameraToggle) {
    info.cameraToggle.dataset.active = String(showCamera);
    info.cameraToggle.disabled = !cameraStream;
  }
  if (info.screenToggle) {
    info.screenToggle.dataset.active = String(showScreen);
    info.screenToggle.disabled = !screenStream;
  }

  const anyStream = cameraStream || screenStream;
  const anyVisible = showCamera || showScreen;
  const showFoldNotice = anyStream && !anyVisible;
  const hasDeclaredMedia =
    user === localUser
      ? mediaState.video || mediaState.screen
      : Boolean(remoteMediaStates[user]?.video || remoteMediaStates[user]?.screen);

  const ensurePlaceholderMounted = () => {
    if (!info.placeholder.isConnected) {
      info.tile.insertBefore(info.placeholder, info.audioEl);
    }
  };

  const showPlaceholder = (text, folded) => {
    ensurePlaceholderMounted();
    info.placeholder.classList.remove("media-placeholder--hidden");
    info.placeholder.hidden = false;
    info.placeholder.dataset.folded = folded ? "true" : "false";
    info.placeholder.textContent = text;
  };

  const hidePlaceholder = () => {
    if (info.placeholder.isConnected) {
      info.placeholder.remove();
    }
    info.placeholder.classList.add("media-placeholder--hidden");
    info.placeholder.hidden = true;
    info.placeholder.dataset.folded = "false";
    info.placeholder.textContent = "";
  };

  if (showFoldNotice) {
    showPlaceholder("画面已折叠", true);
  } else if (!anyStream && !hasDeclaredMedia) {
    showPlaceholder("暂无画面", false);
  } else {
    hidePlaceholder();
  }
}

function updatePageFullscreenButtons() {
  mediaTiles.forEach((info, user) => {
    if (!info.pageFullBtn) return;
    const active = pageFullTileUser === user;
    info.pageFullBtn.dataset.active = String(active);
    info.pageFullBtn.textContent = active ? "退出网页全屏" : "网页全屏";
  });
}

function enterPageFullscreen(user) {
  const info = mediaTiles.get(user);
  if (!info) return;
  if (pageFullTileUser === user) return;
  exitPageFullscreen();
  info.tile.classList.add("media-tile--page-full");
  pageFullTileUser = user;
  if (document.body) {
    document.body.dataset.pageFull = "true";
  }
  updatePageFullscreenButtons();
}

function exitPageFullscreen() {
  if (pageFullTileUser) {
    const info = mediaTiles.get(pageFullTileUser);
    if (info) {
      info.tile.classList.remove("media-tile--page-full");
    }
    pageFullTileUser = "";
  }
  if (document.body) {
    document.body.dataset.pageFull = "false";
  }
  updatePageFullscreenButtons();
}

function togglePageFullscreen(user) {
  if (pageFullTileUser === user) {
    exitPageFullscreen();
  } else {
    enterPageFullscreen(user);
  }
}

function getPreferredMediaElement(info) {
  if (!info) return null;
  if (!info.screenVideo.hidden && hasActiveStream(info.screenVideo)) {
    return info.screenVideo;
  }
  if (!info.cameraVideo.hidden && hasActiveStream(info.cameraVideo)) {
    return info.cameraVideo;
  }
  if (hasActiveStream(info.screenVideo)) {
    return info.screenVideo;
  }
  if (hasActiveStream(info.cameraVideo)) {
    return info.cameraVideo;
  }
  if (info.placeholder && !info.placeholder.hidden) {
    return info.placeholder;
  }
  return info.tile;
}

async function requestNativeFullscreen(user) {
  const info = mediaTiles.get(user);
  if (!info) return;
  exitPageFullscreen();
  const target = getPreferredMediaElement(info);
  if (!target || typeof target.requestFullscreen !== "function") {
    return;
  }
  try {
    await target.requestFullscreen();
    fullscreenOwner = user;
  } catch (error) {
    fullscreenOwner = "";
    if (error && error.message) {
      logItem(eventsList, `进入全屏失败：${error.message}`);
    } else {
      logItem(eventsList, "进入全屏失败");
    }
  }
  updateFullscreenButtons();
}

async function toggleNativeFullscreen(user) {
  if (document.fullscreenElement && fullscreenOwner === user) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  if (document.fullscreenElement && fullscreenOwner !== user) {
    try {
      await document.exitFullscreen();
    } catch (_) {
      /* ignore */
    }
  }
  requestNativeFullscreen(user);
}

function updateFullscreenButtons() {
  const active = Boolean(document.fullscreenElement);
  mediaTiles.forEach((info, user) => {
    if (!info.fullscreenBtn) return;
    const ownsFullscreen = active && fullscreenOwner === user;
    info.fullscreenBtn.dataset.active = String(ownsFullscreen);
    info.fullscreenBtn.textContent = ownsFullscreen ? "退出全屏" : "全屏";
  });
}

function sanitizeParticipantIdentity(participant) {
  return participant?.identity || participant?.name || participant?.sid || "unknown";
}

function attachLocalTrack(kind, track) {
  if (!localUser || !track) return;
  const info = ensureMediaTile(localUser);
  if (!info) return;
  const target = kind === "screen" ? info.screenVideo : info.cameraVideo;
  track.attach(target);
  target.hidden = false;
  applyTileVisibility(localUser);
  updateTileStatus(localUser, mediaState);
}

function detachLocalTrack(kind) {
  if (!localUser) return;
  const info = mediaTiles.get(localUser);
  const track = localTracks[kind];
  if (track) {
    try {
      if (info) {
        track.detach(kind === "screen" ? info.screenVideo : info.cameraVideo);
      } else {
        track.detach();
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (info) {
    const target = kind === "screen" ? info.screenVideo : info.cameraVideo;
    if (target) {
      target.srcObject = null;
      target.hidden = true;
    }
  }
  applyTileVisibility(localUser);
  updateTileStatus(localUser, mediaState);
}

function updateLocalTile() {
  if (!localUser) return;
  applyTileVisibility(localUser);
  updateTileStatus(localUser, mediaState);
}

function sendMediaUpdate() {
  if (!localUser) return;
  sendMessage({ type: "media:update", user: localUser, media: { ...mediaState } });
}

async function fetchLivekitToken(force = false) {
  if (!currentRoomId || !localUser) {
    throw new Error("缺少房间或用户信息，无法连接 LiveKit");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!force && livekitTokenInfo && livekitTokenInfo.expiresAt - LIVEKIT_TOKEN_REFRESH_MARGIN > now) {
    return livekitTokenInfo;
  }
  const resp = await fetch(LIVEKIT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_id: currentRoomId, user: localUser }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || "LiveKit token 获取失败");
  }
  const data = await resp.json();
  livekitTokenInfo = {
    token: data.token,
    serverUrl: data.server_url,
    expiresAt: now + (Number(data.ttl) || 3600),
  };
  return livekitTokenInfo;
}

async function connectLivekit() {
  if (livekitRoom && livekitRoom.state === ConnectionState.Connected) {
    return livekitRoom;
  }
  if (livekitConnectPromise) {
    return livekitConnectPromise;
  }
  livekitConnectPromise = (async () => {
    const tokenInfo = await fetchLivekitToken();
    const room = new Room(LIVEKIT_ROOM_OPTIONS);
    bindLivekitRoom(room);
    await room.connect(tokenInfo.serverUrl, tokenInfo.token);
    livekitRoom = room;
    return room;
  })();
  try {
    return await livekitConnectPromise;
  } finally {
    livekitConnectPromise = null;
  }
}

function bindLivekitRoom(room) {
  room
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      handleTrackSubscribed(track, publication, participant);
    })
    .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      handleTrackUnsubscribed(track, publication, participant);
    })
    .on(RoomEvent.TrackMuted, (_publication, participant) => {
      const user = sanitizeParticipantIdentity(participant);
      if (user && remoteMediaStates[user]) {
        applyTileVisibility(user);
      }
    })
    .on(RoomEvent.TrackUnmuted, (_publication, participant) => {
      const user = sanitizeParticipantIdentity(participant);
      if (user && remoteMediaStates[user]) {
        applyTileVisibility(user);
      }
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      const user = sanitizeParticipantIdentity(participant);
      const info = mediaTiles.get(user);
      if (!info) return;
      info.audioEl.srcObject = null;
      info.cameraVideo.srcObject = null;
      info.screenVideo.srcObject = null;
      applyTileVisibility(user);
    })
    .on(RoomEvent.Disconnected, () => {
      livekitRoom = null;
    });
}

function attachTrackToTile(user, track, source) {
  const info = ensureMediaTile(user);
  if (!info || !track) return;
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach(info.audioEl);
    el.hidden = false;
    el.play().catch(() => {});
    return;
  }
  const target = source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio ? info.screenVideo : info.cameraVideo;
  track.attach(target);
  target.hidden = false;
  applyTileVisibility(user);
}

function handleTrackSubscribed(track, publication, participant) {
  const user = sanitizeParticipantIdentity(participant);
  attachTrackToTile(user, track, publication.source);
  if (user !== localUser) {
    updateTileStatus(user, remoteMediaStates[user]);
  }
}

function handleTrackUnsubscribed(track, publication, participant) {
  const user = sanitizeParticipantIdentity(participant);
  const info = mediaTiles.get(user);
  if (!info || !track) return;
  track.detach();
  if (track.kind === Track.Kind.Audio) {
    info.audioEl.srcObject = null;
    info.audioEl.hidden = true;
  } else {
    const target =
      publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio
        ? info.screenVideo
        : info.cameraVideo;
    target.srcObject = null;
    target.hidden = true;
  }
  applyTileVisibility(user);
}

async function toggleMic() {
  if (mediaState.audio) {
    await disableMic();
    return;
  }
  try {
    await enableMic();
  } catch (error) {
    logItem(eventsList, `麦克风授权失败：${error?.message || error}`);
  }
}

async function enableMic() {
  const room = await connectLivekit();
  const audioTrack = await createLocalAudioTrack({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  const publication = await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone });
  localTracks.audio = audioTrack;
  localPublications.audio = publication;
  mediaState.audio = true;
  setMediaButtonsState();
  updateLocalTile();
  sendMediaUpdate();
}

async function disableMic() {
  await unpublishLocalTrack("audio");
  mediaState.audio = false;
  setMediaButtonsState();
  updateLocalTile();
  sendMediaUpdate();
}

async function toggleCamera() {
  if (mediaState.video) {
    await disableCamera();
    return;
  }
  if (mediaState.screen) {
    notifyExclusiveMedia("camera");
    return;
  }
  try {
    await enableCamera();
  } catch (error) {
    logItem(eventsList, `摄像头授权失败：${error?.message || error}`);
  }
}

async function enableCamera() {
  const room = await connectLivekit();
  const videoTrack = await createLocalVideoTrack({
    facingMode: "user",
    resolution: { width: CAMERA_VIDEO_CONSTRAINTS.width.max, height: CAMERA_VIDEO_CONSTRAINTS.height.max },
    frameRate: MEDIA_FRAME_RATE,
  });
  const publication = await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.Camera });
  localTracks.video = videoTrack;
  localPublications.video = publication;
  mediaState.video = true;
  attachLocalTrack("video", videoTrack);
  setMediaButtonsState();
  sendMediaUpdate();
}

async function disableCamera() {
  detachLocalTrack("video");
  await unpublishLocalTrack("video");
  mediaState.video = false;
  setMediaButtonsState();
  sendMediaUpdate();
}

async function toggleScreenShare() {
  if (mediaState.screen) {
    await disableScreenShare();
    return;
  }
  if (mediaState.video) {
    notifyExclusiveMedia("screen");
    return;
  }
  try {
    await enableScreenShare();
  } catch (error) {
    logItem(eventsList, `屏幕分享失败：${error?.message || error}`);
  }
}

async function enableScreenShare() {
  const room = await connectLivekit();
  const [screenTrack] = await createLocalScreenTracks({
    frameRate: MEDIA_FRAME_RATE,
    resolution: { width: SCREEN_VIDEO_CONSTRAINTS.width.max, height: SCREEN_VIDEO_CONSTRAINTS.height.max },
    screenShare: { audio: false },
  });
  if (!screenTrack) throw new Error("屏幕源不可用");
  const publication = await room.localParticipant.publishTrack(screenTrack, { source: Track.Source.ScreenShare });
  localTracks.screen = screenTrack;
  localPublications.screen = publication;
  mediaState.screen = true;
  attachLocalTrack("screen", screenTrack);
  const mediaTrack = screenTrack.mediaStreamTrack;
  if (mediaTrack) {
    mediaTrack.addEventListener(
      "ended",
      () => {
        disableScreenShare().catch(() => {});
      },
      { once: true },
    );
  }
  setMediaButtonsState();
  sendMediaUpdate();
}

async function disableScreenShare() {
  detachLocalTrack("screen");
  await unpublishLocalTrack("screen");
  mediaState.screen = false;
  setMediaButtonsState();
  sendMediaUpdate();
}

async function unpublishLocalTrack(kind) {
  const publication = localPublications[kind];
  if (publication && livekitRoom?.localParticipant) {
    try {
      await livekitRoom.localParticipant.unpublishTrack(publication.track, true);
    } catch (_) {
      /* ignore */
    }
  }
  localPublications[kind] = null;
  if (localTracks[kind]) {
    try {
      localTracks[kind].stop();
    } catch (_) {
      /* noop */
    }
    localTracks[kind] = null;
  }
}

async function stopAllMedia() {
  await Promise.allSettled([disableMic(), disableCamera(), disableScreenShare()]);
  mediaState.audio = false;
  mediaState.video = false;
  mediaState.screen = false;
  setMediaButtonsState();
}

function cleanupMediaTiles() {
  exitPageFullscreen();
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  fullscreenOwner = "";
  updateFullscreenButtons();
  remoteMediaStates = {};
  mediaTiles.forEach((info, user) => {
    if (user !== localUser) {
      removeMediaTile(user);
    } else {
      detachLocalTrack("video");
      detachLocalTrack("screen");
      if (info.audioEl) {
        info.audioEl.pause();
        info.audioEl.srcObject = null;
        info.audioEl.hidden = true;
      }
      applyTileVisibility(user);
    }
  });
}

function disconnectLivekit() {
  if (livekitRoom) {
    try {
      livekitRoom.disconnect();
    } catch (_) {
      /* ignore */
    }
    livekitRoom = null;
  }
  livekitConnectPromise = null;
}

leaveBtn.addEventListener("click", async () => {
  const departingUser = localUser || currentUserName;
  if (departingUser) {
    clearLeaderboardUser(departingUser);
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    sendMessage({ type: "leave", user: localUser || currentUserName });
    socket.close();
  }
  await stopAllMedia().catch(() => {});
  disconnectLivekit();
  livekitTokenInfo = null;
  sessionStorage.removeItem(JOIN_SESSION_KEY);
  window.location.href = "join.html";
});

function handleTimerAction(action) {
  switch (action) {
    case "start_focus":
      startLocalTimer("focus");
      break;
    case "start_break":
      startLocalTimer("break");
      break;
    case "pause":
      if (timerStatusState === "running") {
        pauseLocalTimer();
      } else if (timerStatusState === "paused") {
        resumeLocalTimer();
      }
      break;
    case "skip_break":
      skipLocalBreak();
      break;
    case "reset":
      resetLocalTimer();
      break;
    default:
      break;
  }
}

actionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    handleTimerAction(action);
  });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  sendMessage({ type: "chat", user: localUser || currentUserName, text });
  chatInput.value = "";
});

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
}

function handleLengthInputChange(kind) {
  if (timerStatusState !== "idle") {
    return;
  }
  if (kind === timerCycle) {
    timerRemaining = getDurationSeconds(kind);
    updateTimerUI();
  }
}

if (focusLengthInput) {
  focusLengthInput.addEventListener("change", () => handleLengthInputChange("focus"));
  focusLengthInput.addEventListener("input", () => handleLengthInputChange("focus"));
}

if (breakLengthInput) {
  breakLengthInput.addEventListener("change", () => handleLengthInputChange("break"));
  breakLengthInput.addEventListener("input", () => handleLengthInputChange("break"));
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    toggleMic().catch((error) => {
      if (error && error.message) {
        logItem(eventsList, `麦克风操作失败：${error.message}`);
      }
    });
  });
}

if (camBtn) {
  camBtn.addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    toggleCamera().catch((error) => {
      if (error && error.message) {
        logItem(eventsList, `摄像头操作失败：${error.message}`);
      }
    });
  });
}

if (screenBtn) {
  screenBtn.addEventListener("click", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    toggleScreenShare().catch((error) => {
      if (error && error.message) {
        logItem(eventsList, `屏幕分享操作失败：${error.message}`);
      }
    });
  });
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fullscreenOwner = "";
  }
  updateFullscreenButtons();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pageFullTileUser && !document.fullscreenElement) {
    exitPageFullscreen();
  }
});

window.addEventListener("beforeunload", () => {
  const departingUser = localUser || currentUserName;
  if (departingUser) {
    clearLeaderboardUser(departingUser);
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    sendMessage({ type: "leave", user: localUser || currentUserName });
    socket.close();
  }
  stopAllMedia().catch(() => {});
  disconnectLivekit();
  livekitTokenInfo = null;
});

setControlsEnabled(false);
setMediaButtonsState();
initLocalTimer();

if (initialJoin) {
  connectRoom().catch((error) => {
    logItem(eventsList, `房间连接失败：${error?.message || error}`);
  });
}
