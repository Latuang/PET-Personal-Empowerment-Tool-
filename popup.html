const periodEl = document.getElementById('period');
const notifEl  = document.getElementById('notif');
const saveBtn  = document.getElementById('save');

chrome.storage.sync.get(['periodMinutes', 'notificationsEnabled'], (cfg) => {
  if (cfg.periodMinutes) periodEl.value = cfg.periodMinutes;
  notifEl.checked = !!cfg.notificationsEnabled;
});

saveBtn.addEventListener('click', () => {
  const period = Math.max(5, parseInt(periodEl.value || '45', 10));
  const notificationsEnabled = notifEl.checked;

  chrome.storage.sync.set({ periodMinutes: period, notificationsEnabled }, () => {
    chrome.alarms.clear('milo-nudge', () => {
      chrome.alarms.create('milo-nudge', { periodInMinutes: period });
      window.close();
    });
  });
});
