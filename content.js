// ===== Floating PET on web pages (content script) =====

// Keys shared with index.html / bg.js
const KEYS = {
  AVATAR: 'petAvatar',          // e.g. "brown_dog_nobg.png"
  LINES:  'petCustomLines',     // string[]
  SESS:   'petSessions',        // [{ts:number, seconds:number}]
  SPEAK:  'petSpeakNow',        // { text, at }
  POS:    'petPos'              // { x, y }
};

// ---------- DOM: pet container, avatar image, speech bubble ----------
const wrap = document.createElement('div');
wrap.style.cssText = `
  position:fixed; z-index:2147483647; inset:auto 18px 18px auto;
  width:96px; height:96px; display:flex; align-items:flex-end; justify-content:center;
  pointer-events:auto;
`;
wrap.setAttribute('data-pet', 'wrap');

const img = document.createElement('img');
img.alt = 'PET avatar';
img.style.cssText = `
  width:96px; height:96px; object-fit:contain; cursor:grab;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,.18));
`;
wrap.appendChild(img);

const bubble = document.createElement('div');
bubble.style.cssText = `
  position:absolute; bottom:90px; right:0; max-width:220px;
  background:#fff; color:#2b2723; border:1.5px solid #e1d6cf; border-radius:12px;
  padding:8px 10px; font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  box-shadow:0 8px 22px rgba(0,0,0,.10), 0 1px 6px rgba(0,0,0,.06);
  display:none;
`;
wrap.appendChild(bubble);

document.documentElement.appendChild(wrap);

// ---------- Helpers ----------
function setBubble(text) {
  if (!text) return;
  bubble.textContent = text;
  bubble.style.display = 'block';
  clearTimeout(setBubble._t);
  setBubble._t = setTimeout(()=> bubble.style.display = 'none', 4200);
}
function speakNow(text){
  // Visual bubble
  setBubble(text);
  // Optional voice (best-effort; won't break if disabled)
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

// Load avatar with robust fallback: try page repo root(./) then extension asset
function setAvatar(file){
  if (!file) return;
  const name = file.trim();
  // First: relative to the current page (works on GitHub Pages)
  img.src = `./${name}`;
  // Fallback: use the extension packaged asset
  img.onerror = () => { img.onerror = null; img.src = chrome.runtime.getURL(`assets/${name}`); };
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

// ---------- Initial load ----------
chrome.storage.local.get([KEYS.AVATAR, KEYS.SPEAK, KEYS.POS], (cfg)=>{
  // Avatar
  setAvatar(cfg[KEYS.AVATAR] || 'brown_dog_nobg.png');

  // Position
  const pos = cfg[KEYS.POS];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    wrap.style.left = pos.x + 'px';
    wrap.style.top  = pos.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  // If page just asked PET to speak recently, show it
  const sp = cfg[KEYS.SPEAK];
  if (sp && sp.text && Date.now() - (sp.at||0) < 120000) speakNow(sp.text);
});

// ---------- React to storage updates (avatar changes, speak requests) ----------
chrome.storage.onChanged.addListener((changes, area)=>{
  if (area !== 'local') return;

  if (changes[KEYS.AVATAR]) {
    const next = changes[KEYS.AVATAR].newValue;
    setAvatar(next || 'brown_dog_nobg.png');
  }

  if (changes[KEYS.SPEAK]) {
    const v = changes[KEYS.SPEAK].newValue;
    if (v && v.text) speakNow(v.text);
  }
});

// ---------- Gentle nudges from bg.js (pick a random saved line) ----------
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === 'NUDGE') {
    chrome.storage.local.get([KEYS.LINES], (cfg)=>{
      const arr = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      const text = arr.length ? arr[Math.floor(Math.random()*arr.length)] : "Time for a tiny step?";
      speakNow(text);
    });
  }
});
