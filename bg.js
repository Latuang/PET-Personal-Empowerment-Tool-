// ===== PET background (service worker) =====
const DEFAULT_PERIOD_MIN = 45;
const ALARM_NAME = 'pet-nudge';
const SESSIONS_KEY = 'petSessions';   // [{ts:number(seconds), seconds:number}]
const PERIOD_KEY   = 'periodMinutes';
const AVATAR_KEY   = 'petAvatar';      // file name under /assets

// Broadcast a message to all http/https tabs
function broadcastToAll(message) {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const t of tabs) if (t.id) chrome.tabs.sendMessage(t.id, message);
  });
}

function scheduleAlarm(period) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: period });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([PERIOD_KEY, AVATAR_KEY], (cfg) => {
    scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
    if (!cfg[AVATAR_KEY]) chrome.storage.local.set({ [AVATAR_KEY]: "brown_dog_nobg.png" });
  });
});

// Alarm → gentle nudge (page bubble will pick a line if payload is null)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastToAll({ type: 'NUDGE', payload: null });
});

// Helper to say a line now everywhere and leave a short echo
function broadcastSay(text) {
  if (!text) return;
  broadcastToAll({ type: 'PET_SAY', text });
  chrome.storage.local.set({ petSpeakNow: { text, at: Date.now() } });
}

// Keep tabs in sync with storage changes (lines + avatar)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.petCustomLines) {
    const lines = Array.isArray(changes.petCustomLines.newValue)
      ? changes.petCustomLines.newValue : [];
    broadcastToAll({ type: 'LINES_UPDATED', lines });
  }
  if (changes[AVATAR_KEY]) {
    const name = changes[AVATAR_KEY].newValue || "brown_dog_nobg.png";
    broadcastToAll({ type: 'PET_AVATAR_CHANGED', name });
  }
});

// ---- Stats helpers ----
function startOfDay(tsMs) { const d = new Date(tsMs); d.setHours(0,0,0,0); return d.getTime(); }
function dayKey(tsMs) { return new Date(startOfDay(tsMs)).toISOString().slice(0,10); }

// Add a completed session (called by web UI when timer ends)
function addSession(seconds, tsMs = Date.now(), cb) {
  const safeSec = Math.max(1, Math.floor(seconds || 0));
  chrome.storage.local.get([SESSIONS_KEY], (cfg) => {
    const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
    sessions.push({ ts: Math.floor(tsMs/1000), seconds: safeSec });
    const trimmed = sessions.slice(-2000);
    chrome.storage.local.set({ [SESSIONS_KEY]: trimmed }, () => cb?.(trimmed));
  });
}

function computeStats(sessions) {
  const now = Date.now();
  const todayStart = startOfDay(now);
  let todaySeconds = 0;
  const perDay = new Map();

  for (const s of sessions) {
    if (!s || typeof s.ts !== 'number' || typeof s.seconds !== 'number') continue;
    const tsMs = s.ts * 1000;
    const key = dayKey(tsMs);
    perDay.set(key, (perDay.get(key) || 0) + Math.max(0, s.seconds));
    if (tsMs >= todayStart) todaySeconds += Math.max(0, s.seconds);
  }

  // last 7 days series (oldest → newest)
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart - i*24*3600*1000);
    const key = d.toISOString().slice(0,10);
    weekly.push({ date: key, seconds: perDay.get(key) || 0 });
  }

  // streaks
  let streak = 0, longest = 0;
  let cur = new Date(todayStart);
  while (true) {
    const key = cur.toISOString().slice(0,10);
    if ((perDay.get(key)||0) > 0) { streak++; longest = Math.max(longest, streak); }
    else break;
    cur = new Date(cur.getTime() - 86400000);
  }

  return { todaySeconds, weekly, currentStreak: streak, longestStreak: longest };
}

// Listen for messages from the page/popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Frequency + avatar + stats/settings
  if (msg?.type === "GET_SETTINGS") {
    chrome.storage.local.get([PERIOD_KEY, AVATAR_KEY, SESSIONS_KEY], (cfg) => {
      const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
      sendResponse({ ok: true,
        minutes: cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN,
        avatar: cfg[AVATAR_KEY] || "brown_dog_nobg.png",
        stats: computeStats(sessions)
      });
    });
    return true;
  }
  if (msg?.type === "SET_FREQUENCY" && Number.isFinite(+msg.minutes)) {
    const m = Math.max(1, Math.floor(+msg.minutes));
    chrome.storage.local.set({ [PERIOD_KEY]: m }, () => {
      scheduleAlarm(m);
      sendResponse({ ok: true, minutes: m });
    });
    return true;
  }
  if (msg?.type === "SET_AVATAR" && typeof msg.name === "string") {
    const name = msg.name;
    chrome.storage.local.set({ [AVATAR_KEY]: name }, () => {
      broadcastToAll({ type: "PET_AVATAR_CHANGED", name });
      sendResponse({ ok: true, name });
    });
    return true;
  }
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.local.get([PERIOD_KEY], (cfg)=> scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN));
    return sendResponse({ ok: true });
  }

  // Pep lines
  if (msg?.type === "PET_ADD_LINES" && Array.isArray(msg.lines)) {
    const cleaned = msg.lines.map(s => String(s).trim()).filter(Boolean);
    chrome.storage.local.get(['petCustomLines'], (cfg) => {
      const current = Array.isArray(cfg.petCustomLines) ? cfg.petCustomLines : [];
      const merged = Array.from(new Set([...current, ...cleaned]));
      const last   = cleaned[cleaned.length - 1] || null;
      chrome.storage.local.set({ petCustomLines: merged }, () => {
        broadcastToAll({ type: 'LINES_UPDATED', lines: merged });
        if (last) broadcastSay(last);
        sendResponse({ ok: true, count: merged.length, said: last || null });
      });
    });
    return true;
  }
  if (msg?.type === "PET_GET_LINES") {
    chrome.storage.local.get(['petCustomLines'], (cfg) => {
      sendResponse({ ok: true, lines: cfg.petCustomLines || [] });
    });
    return true;
  }
  if (msg?.type === "PET_SAY_NOW" && typeof msg.text === "string" && msg.text.trim()) {
    const text = msg.text.trim();
    broadcastSay(text);
    sendResponse({ ok: true, said: text });
    return true;
  }

  // Timer → stats
  if (msg?.type === 'ADD_SESSION' && msg.seconds) {
    addSession(Number(msg.seconds), msg.tsMs || Date.now(), (list)=>{
      sendResponse({ ok:true, stats: computeStats(list) });
    });
    return true;
  }
  if (msg?.type === 'GET_STATS') {
    chrome.storage.local.get([SESSIONS_KEY], (cfg)=>{
      const list = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
      sendResponse({ ok:true, stats: computeStats(list) });
    });
    return true;
  }
});
