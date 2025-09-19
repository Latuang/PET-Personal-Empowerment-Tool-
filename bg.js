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

// Alarm → gentle nudge
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastToAll({ type: 'NUDGE', payload: null });
});

// Helper to say a line now everywhere
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

// Add a completed session (also doable directly from the page via storage)
function addSession(seconds, tsMs = Date.now(), cb) {
  const safeSec = Math.max(1, Math.floor(seconds || 0));
  chrome.storage.local.get([SESSIONS_KEY], (cfg) => {
    const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
    sessions.push({ ts: Math.floor(tsMs/1000), seconds: safeSec });
    const trimmed = sessions.slice(-2000);
    chrome.storage.local.set({ [SESSIONS_KEY]: trimmed }, () => cb?.(trimmed));
  });
}

// Listen for messages from the page/popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.local.get([PERIOD_KEY], (cfg)=> scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN));
  } else if (msg?.type === 'ADD_SESSION' && msg.seconds) {
    addSession(Number(msg.seconds));
  }
});
