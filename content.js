// content.js — floats the PET on every page and makes it talk

const AVATAR_KEY   = 'petAvatar';
const LINES_KEY    = 'petCustomLines';
const SPEAK_KEY    = 'petSpeakNow';

let petEl, bubbleEl;
let currentAvatar = 'brown_dog_nobg.png';
let linesCache = [];

// ---- DOM helpers ----
function ensurePet() {
  if (petEl) return petEl;
  petEl = document.createElement('img');
  petEl.alt = 'PET avatar';
  petEl.draggable = false;
  petEl.style.cssText = `
    position: fixed; right: 18px; bottom: 18px; width: 88px; height: 88px;
    z-index: 2147483647; pointer-events: auto; user-select: none;
    filter: drop-shadow(0 10px 12px rgba(0,0,0,.18));
  `;
  document.documentElement.appendChild(petEl);

  bubbleEl = document.createElement('div');
  bubbleEl.style.cssText = `
    position: fixed; right: 118px; bottom: 82px; max-width: 260px;
    background:#fffef8; color:#2b2723; border:1.5px solid #dccfbf; border-radius:14px;
    padding:10px 12px; font: 13px/1.35 system-ui;
    box-shadow:0 12px 24px rgba(0,0,0,.12), inset 0 1px 0 #fff;
    transform: translateY(10px); opacity:.0; transition: all .18s ease;
    z-index: 2147483647;
  `;
  document.documentElement.appendChild(bubbleEl);

  petEl.addEventListener('click', () => say(randomLine() || "Let's go! One tiny step."));
  return petEl;
}

function setAvatar(name) {
  currentAvatar = name || currentAvatar;
  ensurePet().src = chrome.runtime.getURL(currentAvatar); // images live at root of extension
}

function showBubble(text) {
  if (!text) return;
  ensurePet();
  bubbleEl.textContent = text;
  bubbleEl.style.opacity = '1';
  bubbleEl.style.transform = 'translateY(0)';
  setTimeout(() => {
    bubbleEl.style.opacity = '.0';
    bubbleEl.style.transform = 'translateY(10px)';
  }, 3500);
}

function say(text) {
  showBubble(text);
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1.05;
    speechSynthesis.speak(u);
  } catch (_) {}
}

function randomLine() {
  return linesCache.length ? linesCache[Math.floor(Math.random()*linesCache.length)] : '';
}

// ---- init from storage ----
chrome.storage.local.get([AVATAR_KEY, LINES_KEY, SPEAK_KEY], (cfg) => {
  if (Array.isArray(cfg[LINES_KEY])) linesCache = cfg[LINES_KEY];
  setAvatar(cfg[AVATAR_KEY] || currentAvatar);
  if (cfg[SPEAK_KEY]?.text) say(cfg[SPEAK_KEY].text);
});

// ---- react to storage changes ----
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[AVATAR_KEY]) setAvatar(changes[AVATAR_KEY].newValue);
  if (changes[LINES_KEY]) linesCache = Array.isArray(changes[LINES_KEY].newValue) ? changes[LINES_KEY].newValue : [];
  if (changes[SPEAK_KEY]?.newValue?.text) say(changes[SPEAK_KEY].newValue.text);
});

// ---- react to runtime messages (nudges etc.) ----
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'NUDGE') { say(randomLine() || "You got this!"); }
  if (msg.type === 'LINES_UPDATED') { linesCache = Array.isArray(msg.lines) ? msg.lines : []; }
  if (msg.type === 'PET_AVATAR_CHANGED') { setAvatar(msg.name); }
});
