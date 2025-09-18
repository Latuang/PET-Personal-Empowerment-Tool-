// ===== PET background (service worker) =====

const DEFAULT_PERIOD_MIN = 45;
const ALARM_NAME = 'pet-nudge';
const SESSIONS_KEY = 'petSessions';   // [{ts:number(seconds), seconds:number}]
const PERIOD_KEY   = 'periodMinutes';
const AVATAR_KEY   = 'petAvatar';      // string file name under /assets

// Map any old sausage-dog filename to the new one that lives in /assets
const normalizeAvatar = (name) =>
  name === 'icon128.png' ? 'icon128_fixed.png' : name;

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

    // ensure a default avatar + migrate old value if needed
    const current = normalizeAvatar(cfg[AVATAR_KEY]);
    if (!cfg[AVATAR_KEY]) {
      chrome.storage.local.set({ [AVATAR_KEY]: "brown_dog_nobg.png" });
    } else if (current !== cfg[AVATAR_KEY]) {
      chrome.storage.local.set({ [AVATAR_KEY]: current });
    }
  });
});

// Alarm → send a gentle nudge (PET bubble will pick a line if payload null)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastToAll({ type: 'NUDGE', payload: null });
});

// Helper to say a line now in all tabs + set a small echo in storage
function broadcastSay(text) {
  if (!text) return;
  broadcastToAll({ type: 'PET_SAY', text });
  chrome.storage.local.set({ petSpeakNow: { text, at: Date.now() } });
}

// Keep tabs synced with custom lines + avatar changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.petCustomLines) {
    const lines = Array.isArray(changes.petCustomLines.newValue)
      ? changes.petCustomLines.newValue : [];
    broadcastToAll({ type: 'LINES_UPDATED', lines });
  }
  if (changes[AVATAR_KEY]) {
    const name = normalizeAvatar(changes[AVATAR_KEY].newValue) || "brown_dog_nobg.png";
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
  const worked = new Set([...perDay.keys()]);
  let currentStreak = 0, longestStreak = 0;
  let cursor = todayStart;
  while (worked.has(dayKey(cursor))) { currentStreak++; cursor -= 24*3600*1000; }
  if (worked.size) {
    const all = [...worked].sort();
    let run = 0;
    const first = new Date(all[0] + 'T00:00:00Z').getTime();
    const last  = new Date(all[all.length-1] + 'T00:00:00Z').getTime();
    for (let t=first; t<=last + 24*3600*1000; t+=24*3600*1000) {
      if (worked.has(dayKey(t))) { run++; longestStreak = Math.max(longestStreak, run); }
      else run = 0;
    }
  }

  const totalFocusSecondsAll = sessions.reduce((a,b)=>a + (b?.seconds||0), 0);
  return { todaySeconds, weekly, currentStreak, longestStreak, totalFocusSecondsAll };
}

// popup asks to reschedule after saving frequency locally
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.local.get([PERIOD_KEY], (cfg) => {
      scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ---- External API used by your index.html page ----
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  try {
    const origin = sender?.origin || (sender?.url ? new URL(sender.url).origin : "");
    const allowed = new Set(["https://latuang.github.io", "http://localhost:3000"]);
    if (![...allowed].some(a => origin.startsWith(a))) {
      sendResponse({ ok: false, error: "Origin not allowed", got: origin });
      return;
    }

    // GET_SETTINGS: frequency + avatar + latest stats
    if (msg?.type === "GET_SETTINGS") {
      chrome.storage.local.get([PERIOD_KEY, AVATAR_KEY, SESSIONS_KEY], (cfg) => {
        const avatar = normalizeAvatar(cfg[AVATAR_KEY] || "brown_dog_nobg.png");
        const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
        const stats = computeStats(sessions);
        sendResponse({ ok: true, minutes: cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN, avatar, stats });
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

    if (msg?.type === "SAVE_LINES" && Array.isArray(msg.lines)) {
      chrome.storage.local.set({ petCustomLines: msg.lines }, () => {
        broadcastToAll({ type: 'LINES_UPDATED', lines: msg.lines });
        sendResponse({ ok: true });
      });
      return true;
    }

    if (msg?.type === "LOAD_LINES") {
      chrome.storage.local.get(['petCustomLines'], (cfg) => {
        sendResponse({ ok: true, lines: Array.isArray(cfg.petCustomLines) ? cfg.petCustomLines : [] });
      });
      return true;
    }

    if (msg?.type === "SET_AVATAR" && typeof msg.name === "string") {
      const name = normalizeAvatar(msg.name);
      chrome.storage.local.set({ [AVATAR_KEY]: name }, () => {
        broadcastToAll({ type: "PET_AVATAR_CHANGED", name });
        sendResponse({ ok: true, name });
      });
      return true;
    }

    if (msg?.type === "ADD_SESSION" && Number.isFinite(+msg.seconds)) {
      addSession(Math.max(1, Math.floor(+msg.seconds)), Date.now(), (sessions) => {
        const stats = computeStats(sessions);
        sendResponse({ ok: true, stats });
      });
      return true;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
});
