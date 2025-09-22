// ===== Floating PET on web pages (content script) =====

// Shared storage keys
const KEYS = {
  AVATAR: 'petAvatar',          // "brown_dog_nobg.png", etc.
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

let hideTimer = null;
function showBubble(text) {
  if (!text) return;
  positionBubble();
  bubble.textContent = text;
  bubble.classList.add('show');
  bubble.classList.remove('fadeout');
  const msPerChar = 55;
  const dur = Math.max(2200, Math.min(7000, text.length * msPerChar));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { bubble.classList.remove('show'); }, dur);
}

// Try page-relative first (GitHub Pages), then packaged extension asset
function setAvatar(file) {
  if (!file) return;
  const name = String(file).trim();
  img.src = `./${name}`;
  img.onerror = () => { img.onerror = null; img.src = chrome.runtime.getURL(`assets/${name}`); };
}

// ---------- Drag to move & save position ----------
(function enableDrag() {
  let dragging = false, down = false;
  let sx=0, sy=0, sl=0, st=0;

  const onDown = (e) => {
    down = true; dragging = false;
    img.style.cursor = 'grabbing';
    const r = wrap.getBoundingClientRect();
    sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!down) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!dragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      dragging = true;
      wrap.style.position = 'fixed';
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
    }
    if (dragging) {
      wrap.style.left = `${sl + dx}px`;
      wrap.style.top  = `${st + dy}px`;
      positionBubble();
    }
  };
  const onUp = () => {
    if (!down) return;
    down = false; img.style.cursor = 'grab';
    if (!dragging) {
      // tap/click → say one line
      cycleAndSpeak();
    } else {
      const r = wrap.getBoundingClientRect();
      chrome.storage.local.set({ [KEYS.POS]: { x: r.left, y: r.top } });
    }
  };

  img.addEventListener('mousedown', onDown, { passive:false });
  window.addEventListener('mousemove', onMove, { passive:true });
  window.addEventListener('mouseup', onUp, { passive:true });
})();

// ---------- Lines handling ----------
const DEFAULTS = [
  "Small steps still move you forward.",
  "Momentum beats motivation — start tiny.",
  "25-minute focus, then breathe. You’ve got this.",
  "Done > perfect. One micro-step now.",
  "Future you will thank you for this."
];

let customLines = [];          // from storage
let clickIndex  = 0;           // for cycling on click

function currentPool() {
  return (customLines && customLines.length ? customLines : DEFAULTS);
}
function cycleAndSpeak() {
  const pool = currentPool();
  if (!pool.length) return;
  clickIndex = (clickIndex + 1) % pool.length;
  showBubble(pool[clickIndex]);
}

// ---------- Init from storage ----------
chrome.storage.local.get([KEYS.AVATAR, KEYS.LINES, KEYS.SPEAK, KEYS.POS], (cfg)=>{
  setAvatar(cfg[KEYS.AVATAR] || 'brown_dog_nobg.png');

  if (Array.isArray(cfg[KEYS.LINES])) {
    customLines = cfg[KEYS.LINES].map(s=>String(s).trim()).filter(Boolean);
    clickIndex = customLines.length ? customLines.length - 1 : 0;
  }

  const pos = cfg[KEYS.POS];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    wrap.style.left = pos.x + 'px';
    wrap.style.top  = pos.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  // If something asked us to speak very recently, do it exactly once
  const sp = cfg[KEYS.SPEAK];
  if (sp && sp.text && Date.now() - (sp.at||0) < 8000) {
    showBubble(sp.text);
    chrome.storage.local.set({ [KEYS.SPEAK]: null }); // clear so it won't repeat
  }
});

// React to storage changes (avatar swap, lines updated, speak now)
chrome.storage.onChanged.addListener((changes, area)=>{
  if (area !== 'local') return;
  if (changes[KEYS.AVATAR]) setAvatar(changes[KEYS.AVATAR].newValue || 'brown_dog_nobg.png');
  if (changes[KEYS.LINES]) {
    const v = changes[KEYS.LINES].newValue;
    customLines = Array.isArray(v) ? v.map(s=>String(s).trim()).filter(Boolean) : [];
    clickIndex = customLines.length ? customLines.length - 1 : 0;
  }
  if (changes[KEYS.SPEAK]) {
    const v = changes[KEYS.SPEAK].newValue;
    if (v && v.text) {
      showBubble(v.text);
      chrome.storage.local.set({ [KEYS.SPEAK]: null });
    }
  }
});

// Gentle nudge from bg.js
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === 'NUDGE') {
    const pool = currentPool();
    const text = pool[Math.floor(Math.random()*pool.length)] || "You’ve got this.";
    showBubble(text);
  }
});

// ---------- Page ↔ extension bridge (makes the Control Panel work) ----------
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;

  // Save / merge pep lines coming from the Control Panel
  if (d.type === 'PET_ADD_LINES' && Array.isArray(d.lines)) {
    const cleaned = d.lines.map(s => String(s).trim()).filter(Boolean);
    chrome.storage.local.get([KEYS.LINES], (cfg) => {
      const cur = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      // unique order-preserving merge
      const map = new Map();
      [...cur, ...cleaned].forEach(s => map.set(s, 1));
      const merged = [...map.keys()];
      chrome.storage.local.set({ [KEYS.LINES]: merged }, () => {
        // update local cache + start cycling from the last new line
        customLines = merged;
        clickIndex = merged.length ? merged.length - 1 : 0;
        // ask all tabs (including this one) to say the last new line once
        const last = cleaned[cleaned.length-1] || null;
        if (last) chrome.storage.local.set({ [KEYS.SPEAK]: { text:last, at: Date.now() } });
        // reply to the page so it can refill the textarea if it wants
        window.postMessage({ type:'PET_LINES_RESPONSE', ok:true, lines: merged }, '*');
      });
    });
    return;
  }

  // Ask for current lines (Control Panel “Load from PET”)
  if (d.type === 'PET_GET_LINES') {
    chrome.storage.local.get([KEYS.LINES], (cfg) => {
      const lines = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      window.postMessage({ type:'PET_LINES_RESPONSE', ok:true, lines }, '*');
    });
    return;
  }

  // Say one line now (silent, once)
  if (d.type === 'PET_SAY_NOW' && typeof d.text === 'string' && d.text.trim()) {
    chrome.storage.local.set({ [KEYS.SPEAK]: { text: d.text.trim(), at: Date.now() } });
    return;
  }

  // Optional: avatar/period/session messages if your page sends them
  if (d.type === 'SET_AVATAR' && typeof d.name === 'string') {
    setAvatar(d.name);
    chrome.storage.local.set({ [KEYS.AVATAR]: d.name });
    return;
  }
  if (d.type === 'SET_FREQUENCY' && Number.isFinite(d.minutes)) {
    chrome.storage.local.set({ periodMinutes: Math.max(1, Math.floor(d.minutes)) }, () => {
      chrome.runtime.sendMessage({ type:'RESCHEDULE' });
    });
    return;
  }
  if (d.type === 'ADD_SESSION' && Number.isFinite(d.seconds)) {
    chrome.storage.local.get([KEYS.SESS], (cfg) => {
      const arr = Array.isArray(cfg[KEYS.SESS]) ? cfg[KEYS.SESS] : [];
      arr.push({ ts: Math.floor(Date.now()/1000), seconds: Math.max(1, Math.floor(d.seconds)) });
      chrome.storage.local.set({ [KEYS.SESS]: arr.slice(-2000) });
    });
    return;
  }
});
