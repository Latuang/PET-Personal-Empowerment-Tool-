const DEFAULT_PERIOD_MIN = 45;
const ALARM_NAME = 'pet-nudge';

function scheduleAlarm(period) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: period });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['periodMinutes'], (cfg) => {
    scheduleAlarm(cfg.periodMinutes || DEFAULT_PERIOD_MIN);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RESCHEDULE') {
    chrome.storage.sync.get(['periodMinutes'], (cfg) => {
      scheduleAlarm(cfg.periodMinutes || DEFAULT_PERIOD_MIN);
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  broadcastNudge();
});

function broadcastNudge(payload = null) {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const t of tabs) if (t.id) {
      chrome.tabs.sendMessage(t.id, { type: 'NUDGE', payload });
    }
  });
}

function broadcastSay(text) {
  if (!text) return;
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const t of tabs) if (t.id) {
      chrome.tabs.sendMessage(t.id, { type: 'PET_SAY', text });
    }
  });
  chrome.storage.sync.set({ petSpeakNow: { text, at: Date.now() } });
}

const ALLOWED_ORIGINS = new Set([
  "https://latuang.github.io",
  "http://localhost:3000"
]);

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  try {
    const origin = sender?.origin || (sender?.url ? new URL(sender.url).origin : "");
    if (!ALLOWED_ORIGINS.has(origin)) {
      sendResponse({ ok: false, error: "Origin not allowed", got: origin });
      return;
    }

    if (msg?.type === "PET_SAY_NOW" && typeof msg.text === 'string' && msg.text.trim()) {
      const text = msg.text.trim();
      broadcastSay(text);
      sendResponse({ ok: true, said: text });
      return true;
    }

    if (msg?.type === "PET_ADD_LINES" && Array.isArray(msg.lines)) {
      const cleaned = msg.lines.map(s => String(s).trim()).filter(Boolean);
      chrome.storage.sync.get(['petCustomLines'], (cfg) => {
        const current = Array.isArray(cfg.petCustomLines) ? cfg.petCustomLines : [];
        const merged = Array.from(new Set([...current, ...cleaned]));
        const last   = cleaned[cleaned.length - 1] || null;

        chrome.storage.sync.set({ petCustomLines: merged }, () => {
          if (last) broadcastSay(last);
          sendResponse({ ok: true, count: merged.length, said: last || null });
        });
      });
      return true;
    }

    if (msg?.type === "PET_GET_LINES") {
      chrome.storage.sync.get(['petCustomLines'], (cfg) => {
        sendResponse({ ok: true, lines: cfg.petCustomLines || [] });
      });
      return true;
    }

    if (msg?.type === "PET_CLEAR_LINES") {
      chrome.storage.sync.set({ petCustomLines: [] }, () => {
        sendResponse({ ok: true, count: 0 });
      });
      return true;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
});
