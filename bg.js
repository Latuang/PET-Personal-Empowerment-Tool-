// ===== PET background (service worker) =====
const DEFAULT_PERIOD_MIN = 45;
const ALARM_NAME = 'pet-nudge';
const SESSIONS_KEY = 'petSessions';   // [{ts:number(seconds), seconds:number}]
const PERIOD_KEY   = 'periodMinutes';
const AVATAR_KEY   = 'petAvatar';      // file name (e.g. "brown_dog_nobg.png")

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
  chrome.storage.local.get([PERIOD_KEY, AVATAR_KEY], (cfg) => {
    scheduleAlarm(cfg[PERIOD_KEY] || DEFAULT_PERIOD_MIN);
    if (!cfg[AVATAR_KEY]) chrome.storage.local.set({ [AVATAR_KEY]: "brown_dog_nobg.png" });
  });
});

// Alarm → gentle nudge
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastToAll({ type: 'NUDGE' });
});

// Keep tabs in sync with storage changes (lines + avatar → optional)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[AVATAR_KEY]) {
    broadcastToAll({ type: 'PET_AVATAR_CHANGED', name: changes[AVATAR_KEY].newValue || "brown_dog_nobg.png" });
  }
});

// ---- Stats helper (optional from pages) ----
function addSession(seconds, tsMs = Date.now(), cb) {
  const safeSec = Math.max(1, Math.floor(seconds || 0));
  chrome.storage.local.get([SESSIONS_KEY], (cfg) => {
    const sessions = Array.isArray(cfg[SESSIONS_KEY]) ? cfg[SESSIONS_KEY] : [];
    sessions.push({ ts: Math.floor(tsMs/1000), seconds: safeSec });
    chrome.storage.local.set({ [SESSIONS_KEY]: sessions.slice(-2000) }, () => cb?.(sessions));
  });
}

// Messages from page/popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.local.get(['periodMinutes'], (cfg)=> scheduleAlarm(cfg.periodMinutes || DEFAULT_PERIOD_MIN));
  } else if (msg?.type === 'ADD_SESSION' && msg.seconds) {
    addSession(Number(msg.seconds));
  }
});
