// ===== Floating PET on web pages (content script) =====

const KEYS = {
  AVATAR: 'petAvatar',          // e.g. "brown_dog_nobg.png"
  LINES:  'petCustomLines',     // string[]
  SESS:   'petSessions',        // [{ts:number, seconds:number}]
  SPEAK:  'petSpeakNow',        // { text, at }
  POS:    'petPos'              // { x, y }
};

// ---------- DOM ----------
const wrap = document.createElement('div');
wrap.style.cssText = `
  position:fixed; z-index:2147483647; inset:auto 18px 18px auto;
  width:110px; height:110px; display:flex; align-items:flex-end; justify-content:center;
  pointer-events:auto;
`;
wrap.setAttribute('data-pet', 'wrap');

const img = document.createElement('img');
img.alt = 'PET avatar';
img.style.cssText = `
  width:100px; height:100px; object-fit:contain; cursor:grab;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,.18));
`;
wrap.appendChild(img);

// Speech bubble with tail (right/left auto)
const bubble = document.createElement('div');
bubble.className = 'pet-bubble';
bubble.style.cssText = `
  position:absolute; bottom:92px; right:0; max-width:260px;
  background:#fff; color:#2b2723; border:1.5px solid #e1d6cf; border-radius:12px;
  padding:8px 10px; font:13px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  box-shadow:0 8px 22px rgba(0,0,0,.10), 0 1px 6px rgba(0,0,0,.06);
  display:none;
`;
wrap.appendChild(bubble);

// Tail via :after
const style = document.createElement('style');
style.textContent = `
  .pet-bubble { position:absolute; }
  .pet-bubble.show { display:block; }
  .pet-bubble.right::after,
  .pet-bubble.left::after {
    content:""; position:absolute; width:0; height:0; border:10px solid transparent;
  }
  .pet-bubble.right::after {
    right:-6px; bottom:10px;
    border-left-color:#fff; filter:drop-shadow(1px 0 0 #e1d6cf);
  }
  .pet-bubble.left::after {
    left:-6px; bottom:10px;
    border-right-color:#fff; filter:drop-shadow(-1px 0 0 #e1d6cf);
  }
`;
document.documentElement.appendChild(style);

document.documentElement.appendChild(wrap);

// ---------- Utils ----------
function positionBubble() {
  const r = wrap.getBoundingClientRect();
  const spaceRight = window.innerWidth - r.right;
  const spaceLeft  = r.left;
  const preferRight = spaceRight >= 220 || spaceRight > spaceLeft;
  bubble.classList.toggle('right', preferRight);
  bubble.classList.toggle('left', !preferRight);
  bubble.style.bottom = '92px';
  bubble.style.right  = preferRight ? '0' : 'auto';
  bubble.style.left   = preferRight ? 'auto' : '0';
}
function showBubble(text, ms) {
  if (!text) return;
  positionBubble();
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(showBubble._t);
  const dur = Math.max(2200, Math.min(7000, ms || 3500));
  showBubble._t = setTimeout(() => bubble.classList.remove('show'), dur);
}
function speak(text) { showBubble(text); } // visual only

// Always load avatar from the packaged assets
function setAvatar(file){
  const name = (file || 'brown_dog_nobg.png').trim();
  img.src = chrome.runtime.getURL(`assets/${name}`);
}

// ---------- Drag to move & save position ----------
(function makeDraggable(){
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  wrap.addEventListener('mousedown', (e)=>{
    dragging = true; img.style.cursor = 'grabbing';
    startX = e.clientX; startY = e.clientY;
    const r = wrap.getBoundingClientRect();
    startLeft = r.left; startTop = r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const left = Math.max(0, startLeft + dx);
    const top  = Math.max(0, startTop + dy);
    wrap.style.left = left + 'px';
    wrap.style.top  = top  + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', ()=>{
    if (!dragging) return;
    dragging = false; img.style.cursor = 'grab';
    const r = wrap.getBoundingClientRect();
    chrome.storage.local.set({ [KEYS.POS]: { x: r.left, y: r.top } });
  });

  // Touch
  wrap.addEventListener('touchstart', (e)=>{
    const t = e.touches[0]; if (!t) return;
    dragging = true; startX = t.clientX; startY = t.clientY;
    const r = wrap.getBoundingClientRect(); startLeft = r.left; startTop = r.top;
  }, {passive:true});
  window.addEventListener('touchmove', (e)=>{
    if (!dragging) return;
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    const left = Math.max(0, startLeft + dx);
    const top  = Math.max(0, startTop + dy);
    wrap.style.left = left + 'px';
    wrap.style.top  = top  + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }, {passive:true});
  window.addEventListener('touchend', ()=>{
    if (!dragging) return;
    dragging = false;
    const r = wrap.getBoundingClientRect();
    chrome.storage.local.set({ [KEYS.POS]: { x: r.left, y: r.top } });
  });
})();

// ---------- Lines (defaults + saved) ----------
const DEFAULTS = [
  "Small steps still move you forward.",
  "Momentum beats motivation—start tiny.",
  "25-minute focus, then breathe. You’ve got this.",
  "Done > perfect. One micro-step now.",
  "Future you will thank you for this."
];

let customLines = [];
let clickIndex = 0;

// Clicking the pet cycles through your saved lines (or defaults if none)
img.addEventListener('click', ()=>{
  const pool = (customLines && customLines.length) ? customLines : DEFAULTS;
  speak(pool[clickIndex % pool.length]);
  clickIndex++;
});

// ---------- Initial load ----------
chrome.storage.local.get([KEYS.AVATAR, KEYS.LINES, KEYS.SPEAK, KEYS.POS], (cfg)=>{
  // Avatar
  setAvatar(cfg[KEYS.AVATAR]);

  // Lines
  if (Array.isArray(cfg[KEYS.LINES])) customLines = cfg[KEYS.LINES];

  // Position
  const pos = cfg[KEYS.POS];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    wrap.style.left = pos.x + 'px';
    wrap.style.top  = pos.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  // If the control panel just wrote a speak-now, show it ONCE
  const sp = cfg[KEYS.SPEAK];
  if (sp && sp.text && Date.now() - (sp.at||0) < 8000) {
    speak(sp.text);
    chrome.storage.local.set({ [KEYS.SPEAK]: null });
  }
});

// ---------- Live updates from storage ----------
chrome.storage.onChanged.addListener((changes, area)=>{
  if (area !== 'local') return;

  if (changes[KEYS.AVATAR]) setAvatar(changes[KEYS.AVATAR].newValue || 'brown_dog_nobg.png');

  if (changes[KEYS.LINES]) {
    const v = changes[KEYS.LINES].newValue;
    customLines = Array.isArray(v) ? v : [];
    clickIndex = 0; // restart the cycle
  }

  if (changes[KEYS.SPEAK]) {
    const v = changes[KEYS.SPEAK].newValue;
    if (v && v.text) {
      speak(v.text);
      chrome.storage.local.set({ [KEYS.SPEAK]: null }); // prevent repeats
    }
  }
});

// ---------- Gentle nudges from bg.js ----------
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === 'NUDGE') {
    const pool = (customLines && customLines.length) ? customLines : DEFAULTS;
    speak(pool[Math.floor(Math.random()*pool.length)]);
  }
});

// ---------- Page ↔ content-script bridge ----------
// Lets your index.html post messages instead of using chrome.* directly.
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;

  // Save lines (merge + de-dupe). Also set a one-time "speak now".
  if (d.type === 'PET_ADD_LINES' && Array.isArray(d.lines)) {
    chrome.storage.local.get([KEYS.LINES], (cfg) => {
      const current = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      const cleaned = d.lines.map(s => String(s).trim()).filter(Boolean);
      const merged  = Array.from(new Set([...current, ...cleaned]));
      chrome.storage.local.set({ [KEYS.LINES]: merged }, () => {
        customLines = merged;
        clickIndex = 0;
        const last = cleaned[cleaned.length - 1];
        if (last) chrome.storage.local.set({ [KEYS.SPEAK]: { text:last, at: Date.now() } });
      });
    });
  }

  // Ask for current lines
  if (d.type === 'PET_GET_LINES') {
    chrome.storage.local.get([KEYS.LINES], (cfg) => {
      const lines = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      window.postMessage({ type:'PET_LINES_RESPONSE', lines }, '*');
    });
  }

  // Immediate speak
  if (d.type === 'PET_SAY_NOW' && typeof d.text === 'string' && d.text.trim()) {
    chrome.storage.local.set({ [KEYS.SPEAK]: { text: d.text.trim(), at: Date.now() } });
  }

  // Avatar set from control page (your avatar picker already works)
  if (d.type === 'PET_SET_AVATAR' && typeof d.file === 'string') {
    chrome.storage.local.set({ [KEYS.AVATAR]: d.file });
  }

  // Optional: reschedule alarms, add a session (both no-ops if bg not listening)
  if (d.type === 'PET_RESCHEDULE') chrome.runtime?.sendMessage?.({ type:'RESCHEDULE' });
  if (d.type === 'PET_ADD_SESSION' && Number.isFinite(d.seconds)) {
    chrome.storage.local.get([KEYS.SESS], (cfg)=>{
      const sessions = Array.isArray(cfg[KEYS.SESS]) ? cfg[KEYS.SESS] : [];
      sessions.push({ ts: Math.floor(Date.now()/1000), seconds: Math.max(1, Math.floor(d.seconds)) });
      chrome.storage.local.set({ [KEYS.SESS]: sessions.slice(-2000) });
    });
  }
});
