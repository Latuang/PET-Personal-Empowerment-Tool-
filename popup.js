const periodEl = document.getElementById('period');
const notifEl  = document.getElementById('notif');
const saveBtn  = document.getElementById('save');
const testBtn  = document.getElementById('test');

chrome.storage.sync.get(['periodMinutes', 'notificationsEnabled'], (cfg) => {
  if (cfg.periodMinutes) periodEl.value = cfg.periodMinutes;
  if (notifEl) notifEl.checked = !!cfg.notificationsEnabled;
});

saveBtn.addEventListener('click', () => {
  const period = Math.max(5, parseInt(periodEl.value || '45', 10));
  const notificationsEnabled = !!(notifEl && notifEl.checked);

  chrome.storage.sync.set({ periodMinutes: period, notificationsEnabled }, () => {
    chrome.runtime.sendMessage({ type: 'RESCHEDULE' });
    window.close();
  });
});

testBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ petSpeakNow: { text: 'Let’s go! One tiny step.', at: Date.now() } });
});
