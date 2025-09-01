// ===== PET background (service worker) =====

// How often to nudge by default (minutes)
const DEFAULT_PERIOD_MIN = 45;

// Helper: send a message to all http/https tabs that have our content script
function broadcastToAll(message) {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const t of tabs) if (t.id) chrome.tabs.sendMessage(t.id, message);
  });
}

function scheduleAlarm(period) {
  chrome.alarms.clear('pet-nudge', () => {
    chrome.alarms.create('pet-nudge', { periodInMinutes: period });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['periodMinutes'], (cfg) => {
    scheduleAlarm(cfg.periodMinutes || DEFAULT_PERIOD_MIN);
  });
});

// Alarm → nudge all tabs
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'pet-nudge') return;
  broadcastToAll({ type: 'NUDGE', payload: null });
});

// Small helper to say a line now everywhere
function broadcastSay(text) {
  if (!text) return;
  broadcastToAll({ type: 'PET_SAY', text });
  // storage echo so content scripts that miss the runtime msg still catch it
  chrome.storage.sync.set({ petSpeakNow: { text, at: Date.now() } });
}

// Keep all tabs in sync when storage changes (even if not triggered by control page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.petCustomLines) {
    const lines = Array.isArray(changes.petCustomLines.newValue)
      ? changes.petCustomLines.newValue : [];
    // Tell every existing PET to swap to the latest lines immediately
    broadcastToAll({ type: 'LINES_UPDATED', lines });
  }
});

// External API (control panel page talks to us via extension ID)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  try {
    // Only allow from your control panel host(s)
    const origin = sender?.origin || (sender?.url ? new URL(sender.url).origin : "");
    const allowed = new Set([
      "https://latuang.github.io",
      "https://latuang.github.io"
    ]);
    if (![...allowed].some(a => origin.startsWith(a))) {
      sendResponse({ ok: false, error: "Origin not allowed", got: origin });
      return;
    }

    // Save + merge custom lines, then notify every tab and optionally say the last line
    if (msg?.type === "PET_ADD_LINES" && Array.isArray(msg.lines)) {
      const cleaned = msg.lines.map(s => String(s).trim()).filter(Boolean);
      chrome.storage.sync.get(['petCustomLines'], (cfg) => {
        const current = Array.isArray(cfg.petCustomLines) ? cfg.petCustomLines : [];
        const merged = Array.from(new Set([...current, ...cleaned]));
        const last   = cleaned[cleaned.length - 1] || null;

        chrome.storage.sync.set({ petCustomLines: merged }, () => {
          // Immediately push to all open tabs (no refresh needed)
          broadcastToAll({ type: 'LINES_UPDATED', lines: merged });
          if (last) broadcastSay(last);
          sendResponse({ ok: true, count: merged.length, said: last || null });
        });
      });
      return true; // async
    }

    // Ask for current list
    if (msg?.type === "PET_GET_LINES") {
      chrome.storage.sync.get(['petCustomLines'], (cfg) => {
        sendResponse({ ok: true, lines: cfg.petCustomLines || [] });
      });
      return true;
    }

    // Force a “say now” for all tabs
    if (msg?.type === "PET_SAY_NOW" && typeof msg.text === "string" && msg.text.trim()) {
      const text = msg.text.trim();
      broadcastSay(text);
      sendResponse({ ok: true, said: text });
      return true;
    }

    // From popup: re-schedule
    if (msg?.type === "RESCHEDULE") {
      chrome.storage.sync.get(['periodMinutes'], (cfg) => {
        scheduleAlarm(cfg.periodMinutes || DEFAULT_PERIOD_MIN);
        sendResponse({ ok: true });
      });
      return true;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
});
