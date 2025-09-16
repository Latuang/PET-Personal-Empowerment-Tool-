const periodEl = document.getElementById('period');
const saveBtn  = document.getElementById('save');
const testBtn  = document.getElementById('test');

// Load current settings
chrome.storage.local.get(['periodMinutes'], (cfg) => {
  if (periodEl && cfg.periodMinutes) periodEl.value = cfg.periodMinutes;
});

// Save settings & reschedule the alarm
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    const period = Math.max(1, parseInt(periodEl?.value || '45', 10));
    chrome.storage.local.set({ periodMinutes: period }, () => {
      chrome.runtime.sendMessage({ type: 'RESCHEDULE' });
      window.close();
    });
  });
}

// Quick test: make PET speak now
if (testBtn) {
  testBtn.addEventListener('click', () => {
    chrome.storage.local.set({ petSpeakNow: { text: 'Let’s go! One tiny step.', at: Date.now() } });
  });
}
