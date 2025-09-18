// ===== PET background (service worker) =====

const DEFAULT_PERIOD_MIN = 45;
const ALARM_NAME = 'pet-nudge';
const SESSIONS_KEY = 'petSessions';   // [{ts:number(seconds), seconds:number}]
const PERIOD_KEY   = 'periodMinutes';
const AVATAR_KEY   = 'petAvatar';      // { name: "light_dog_nobg.png" }

// Broadcast to all http/https tabs
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
  chrome.storage.local.get([PERIOD_KEY], (cfg) => {
    scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
  });
});

// Alarm → gentle nudge
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastToAll({ type: 'NUDGE', payload: null });
});

// Speak now helper
function broadcastSay(text) {
  if (!text) return;
  broadcastToAll({ type: 'PET_SAY', text });
  chrome.storage.local.set({ petSpeakNow: { text, at: Date.now() } });
}

// Sync lines & avatar to all tabs
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.petCustomLines) {
    const lines = Array.isArray(changes.petCustomLines.newValue)
      ? changes.petCustomLines.newValue : [];
    broadcastToAll({ type: 'LINES_UPDATED', lines });
  }
  if (changes[AVATAR_KEY]) {
    const name = (changes[AVATAR_KEY].newValue || {}).name || null;
    broadcastToAll({ type: 'AVATAR_CHANGED', name });
  }
});

// ---- Stats helpers ----
function startOfDay(tsMs) { const d = new Date(tsMs); d.setHours(0,0,0,0); return d.getTime(); }
function dayKey(tsMs) { return new Date(startOfDay(tsMs)).toISOString().slice(0,10); }

function addSession(seconds, tsMs = Date.now(), cb) {
  const safeSec = Math.max(1, Math.floor(seconds || 0));
  chrome.storage.local.get([SESSIONS_KEY], (cfg) => {
    const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
    sessions.push({ ts: Math.floor(tsMs/1000), seconds: safeSec });
    chrome.storage.local.set({ [SESSIONS_KEY]: sessions.slice(-2000) }, () => cb?.(sessions));
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

  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart - i*24*3600*1000);
    weekly.push({ date: d.toISOString().slice(0,10), seconds: perDay.get(d.toISOString().slice(0,10)) || 0 });
  }

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

// popup reschedule
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.local.get([PERIOD_KEY], (cfg) => {
      scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ---- External API for index.html
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  try {
    const origin = sender?.origin || (sender?.url ? new URL(sender.url).origin : "");
    const allowed = new Set(["https://latuang.github.io", "http://localhost:3000"]);
    if (![...allowed].some(a => origin.startsWith(a))) {
      sendResponse({ ok: false, error: "Origin not allowed", got: origin });
      return;
    }

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

    if (msg?.type === "SET_PERIOD" && Number.isFinite(+msg.minutes)) {
      const minutes = Math.max(1, Math.floor(+msg.minutes));
      chrome.storage.local.set({ [PERIOD_KEY]: minutes }, () => {
        scheduleAlarm(minutes);
        sendResponse({ ok: true, minutes });
      });
      return true;
    }

    if (msg?.type === "GET_SETTINGS") {
      chrome.storage.local.get([PERIOD_KEY, AVATAR_KEY], (cfg) => {
        sendResponse({
          ok: true,
          minutes: cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN,
          avatar: cfg[AVATAR_KEY]?.name || null
        });
      });
      return true;
    }

    if (msg?.type === "LOG_SESSION" && Number.isFinite(+msg.seconds)) {
      const seconds = Math.max(1, Math.floor(+msg.seconds));
      const tsMs = Number.isFinite(+msg.tsMs) ? +msg.tsMs : Date.now();
      addSession(seconds, tsMs, () => sendResponse({ ok: true }));
      return true;
    }

    if (msg?.type === "GET_STATS") {
      chrome.storage.local.get([SESSIONS_KEY], (cfg) => {
        const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
        sendResponse({ ok: true, stats: computeStats(sessions) });
      });
      return true;
    }

    // NEW: avatar endpoints
    if (msg?.type === "SET_AVATAR" && typeof msg.name === "string") {
      const name = msg.name.trim();
      chrome.storage.local.set({ [AVATAR_KEY]: { name } }, () => {
        broadcastToAll({ type: 'AVATAR_CHANGED', name });
        sendResponse({ ok: true, name });
      });
      return true;
    }
    if (msg?.type === "GET_AVATAR") {
      chrome.storage.local.get([AVATAR_KEY], (cfg) => {
        sendResponse({ ok: true, name: cfg[AVATAR_KEY]?.name || null });
      });
      return true;
    }

    if (msg?.type === "RESCHEDULE") {
      chrome.storage.local.get([PERIOD_KEY], (cfg) => {
        scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
        sendResponse({ ok: true });
      });
      return true;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
});
