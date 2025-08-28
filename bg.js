const DEFAULT_PERIOD_MIN = 45;

function scheduleAlarm(period) {
  chrome.alarms.clear('pet-nudge', () => {
    chrome.alarms.create('pet-nudge', { periodInMinutes: period });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['petPeriodMinutes'], (cfg) => {
    scheduleAlarm(cfg.petPeriodMinutes || DEFAULT_PERIOD_MIN);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'pet-nudge') return;

  // You can optionally prefill a fallback message here
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id) chrome.tabs.sendMessage(t.id, { type: 'NUDGE' });
    }
  });
});
