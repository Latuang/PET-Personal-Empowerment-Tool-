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

// Speech bubble with tail (auto flips left/right)
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

// Tail via CSS
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

// ---------- Helpers ----------
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

// Visual-only “speak”
function speak(text) { showBubble(text); }

// Always load avatar from the extension package
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

  // Touch support
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

// ---------- Lines (dialogue list) ----------
let customLines = [];
let clickIndex = 0;

// Cycle through lines on click
img.addEventListener('click', ()=>{
  const pool = customLines.length ? customLines : ["You’ve got this."];
  speak(pool[clickIndex % pool.length]);
  clickIndex++;
});

// ---------- Initial load from storage ----------
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

  // “Speak now” sent recently by control page
  const sp = cfg[KEYS.SPEAK];
  if (sp && sp.text && Date.now() - (sp.at||0) < 8000) {
    speak(sp.text);
    chrome.storage.local.set({ [KEYS.SPEAK]: null }); // avoid repeats
  }
});

// ---------- Live updates from storage ----------
chrome.storage.onChanged.addListener((changes, area)=>{
  if (area !== 'local') return;

  if (changes[KEYS.AVATAR]) {
    setAvatar(changes[KEYS.AVATAR].newValue);
  }

  if (changes[KEYS.LINES]) {
    const v = changes[KEYS.LINES].newValue;
    customLines = Array.isArray(v) ? v : [];
    clickIndex = 0;
  }

  if (changes[KEYS.SPEAK]) {
    const v = changes[KEYS.SPEAK].newValue;
    if (v && v.text) {
      speak(v.text);
      chrome.storage.local.set({ [KEYS.SPEAK]: null }); // once
    }
  }
});

// ---------- Bridge: messages from the control page (index.html) ----------
window.addEventListener('message', (e)=>{
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  // Save + merge pep lines, then speak the last line once
  if (msg.type === 'PET_ADD_LINES' && Array.isArray(msg.lines)) {
    const cleaned = msg.lines.map(s=>String(s).trim()).filter(Boolean);
    chrome.storage.local.get([KEYS.LINES], (cfg)=>{
      const current = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      const merged  = Array.from(new Set([...current, ...cleaned]));
      chrome.storage.local.set({ [KEYS.LINES]: merged }, ()=>{
        customLines = merged;
        clickIndex = 0;
      });
    });
  }

  // Ask PET to say a line silently now (no TTS)
  if (msg.type === 'PET_SAY_NOW' && typeof msg.text === 'string' && msg.text.trim()) {
    const t = msg.text.trim();
    speak(t);
    chrome.storage.local.set({ [KEYS.SPEAK]: null }); // ensure no repeats elsewhere
  }

  // Control page wants the current lines
  if (msg.type === 'PET_GET_LINES') {
    chrome.storage.local.get([KEYS.LINES], (cfg)=>{
      const arr = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      window.postMessage({ type:'PET_LINES_RESPONSE', lines: arr }, '*');
    });
  }

  // Set avatar from control page
  if (msg.type === 'PET_SET_AVATAR' && typeof msg.file === 'string') {
    chrome.storage.local.set({ [KEYS.AVATAR]: msg.file });
  }

  // Timer finished: record a session (optional)
  if (msg.type === 'PET_ADD_SESSION' && Number.isFinite(msg.seconds) && msg.seconds > 0) {
    chrome.storage.local.get([KEYS.SESS], (cfg)=>{
      const list = Array.isArray(cfg[KEYS.SESS]) ? cfg[KEYS.SESS] : [];
      list.push({ ts: Math.floor(Date.now()/1000), seconds: Math.floor(msg.seconds) });
      chrome.storage.local.set({ [KEYS.SESS]: list.slice(-2000) });
    });
  }

  // Nudge scheduling (background will listen if installed)
  if (msg.type === 'PET_RESCHEDULE') {
    try { chrome.runtime.sendMessage({ type:'RESCHEDULE' }); } catch {}
  }
});

// ---------- Gentle nudges from bg.js (random saved line) ----------
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === 'NUDGE') {
    const pool = customLines.length ? customLines : ["Time for a tiny step?"];
    speak(pool[Math.floor(Math.random()*pool.length)]);
  }
});
