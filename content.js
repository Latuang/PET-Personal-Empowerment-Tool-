// ===== Floating PET on web pages (content script) =====

// Keys shared with index.html / bg.js
const KEYS = {
  AVATAR: 'petAvatar',          // e.g. "brown_dog_nobg.png"
  LINES:  'petCustomLines',     // string[]
  SESS:   'petSessions',        // [{ts:number, seconds:number}]
  SPEAK:  'petSpeakNow',        // { text, at }
  POS:    'petPos'              // { x, y }
};

// Default pep lines
const DEFAULTS = [
  "Small steps still move you forward.",
  "Momentum beats motivation—start tiny.",
  "25-minute focus, then breathe. You've got this.",
  "Done > perfect. One micro-step now.",
  "Future you will thank you for this."
];

// ---------- DOM: pet container, avatar image, speech bubble ----------
const wrap = document.createElement('div');
wrap.style.cssText = `
  position:fixed; z-index:2147483647; inset:auto 18px 18px auto;
  width:72px; height:72px; display:flex; align-items:flex-end; justify-content:center;
  pointer-events:auto;
`;
wrap.setAttribute('data-pet', 'wrap');

const img = document.createElement('img');
img.alt = 'PET avatar';
img.style.cssText = `
  width:72px; height:72px; object-fit:contain; cursor:grab;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,.18));
  animation: petFloat 3s ease-in-out infinite;
`;
wrap.appendChild(img);

// Add keyframes for floating animation
const style = document.createElement('style');
style.textContent = `
  @keyframes petFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
`;
document.head.appendChild(style);

const bubble = document.createElement('div');
bubble.style.cssText = `
  position:absolute; bottom:66px; right:0; max-width:220px;
  background:#fff; color:#2b2723; border:1.5px solid #e1d6cf; border-radius:12px;
  padding:8px 10px; font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  box-shadow:0 8px 22px rgba(0,0,0,.10), 0 1px 6px rgba(0,0,0,.06);
  display:none;
`;
wrap.appendChild(bubble);

document.documentElement.appendChild(wrap);

//---------- Helpers ----------
function setBubble(text) {
  if (!text) return;
  bubble.textContent = text;
  bubble.style.display = 'block';
  clearTimeout(setBubble._t);
  setBubble._t = setTimeout(()=> bubble.style.display = 'none', 4200);
}

function speakNow(text){
  setBubble(text);
  
  // Text-to-speech only (removed sound effects)
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

// Get random line from available lines (custom + defaults)
function getRandomLine(customLines = []) {
  const allLines = [...customLines, ...DEFAULTS];
  return allLines[Math.floor(Math.random() * allLines.length)];
}

// Load avatar with robust fallback: try page root(./) then extension asset
function setAvatar(file){
  if (!file) return;
  const name = file.trim();
  img.src = `./${name}`;
  img.onerror = () => { img.onerror = null; img.src = chrome.runtime.getURL(`assets/${name}`); };
}

// ---------- Drag to move & save position ----------
(function makeDraggable(){
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let isDragging = false; // Track if we're actually dragging vs just clicking
  
  wrap.addEventListener('mousedown', (e)=>{
    dragging = true; 
    isDragging = false; // Reset drag state
    img.style.cursor = 'grabbing';
    img.style.animation = 'none'; // Pause floating during drag
    startX = e.clientX; startY = e.clientY;
    const r = wrap.getBoundingClientRect();
    startLeft = r.left; startTop = r.top;
    e.preventDefault();
  });
  
  window.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    
    // If we've moved more than a few pixels, consider it a drag
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      isDragging = true;
    }
    
    const left = Math.max(0, startLeft + dx);
    const top  = Math.max(0, startTop + dy);
    wrap.style.left = left + 'px';
    wrap.style.top  = top  + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  });
  
  window.addEventListener('mouseup', (e)=>{
    if (!dragging) return;
    dragging = false; 
    img.style.cursor = 'grab';
    img.style.animation = 'petFloat 3s ease-in-out infinite'; // Resume floating
    
    // If we didn't drag, treat it as a click
    if (!isDragging) {
      handleAvatarClick();
    }
    
    const r = wrap.getBoundingClientRect();
    chrome.storage.local.set({ [KEYS.POS]: { x: r.left, y: r.top } });
  });

  // Touch support
  let touchStartX = 0, touchStartY = 0, touchIsDragging = false;
  
  wrap.addEventListener('touchstart', (e)=>{
    const t = e.touches[0]; if (!t) return;
    dragging = true; 
    touchIsDragging = false;
    img.style.animation = 'none'; // Pause floating during drag
    touchStartX = startX = t.clientX; 
    touchStartY = startY = t.clientY;
    const r = wrap.getBoundingClientRect(); 
    startLeft = r.left; startTop = r.top;
  }, {passive:true});
  
  window.addEventListener('touchmove', (e)=>{
    if (!dragging) return;
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    
    // If we've moved more than a few pixels, consider it a drag
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      touchIsDragging = true;
    }
    
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
    img.style.animation = 'petFloat 3s ease-in-out infinite'; // Resume floating
    
    // If we didn't drag, treat it as a tap
    if (!touchIsDragging) {
      handleAvatarClick();
    }
    
    const r = wrap.getBoundingClientRect();
    chrome.storage.local.set({ [KEYS.POS]: { x: r.left, y: r.top } });
  });
})();

// Handle avatar click/tap - speak a random line
function handleAvatarClick() {
  chrome.storage.local.get([KEYS.LINES], (cfg) => {
    const customLines = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
    const randomLine = getRandomLine(customLines);
    speakNow(randomLine);
  });
}

// ---------- Initial load ----------
chrome.storage.local.get([KEYS.AVATAR, KEYS.SPEAK, KEYS.POS], (cfg)=>{
  setAvatar(cfg[KEYS.AVATAR] || 'brown_dog_nobg.png');

  const pos = cfg[KEYS.POS];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    wrap.style.left = pos.x + 'px';
    wrap.style.top  = pos.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  // Only speak on initial load if it's very recent (within 30 seconds)
  const sp = cfg[KEYS.SPEAK];
  if (sp && sp.text && Date.now() - (sp.at||0) < 30000) {
    speakNow(sp.text);
  }
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
    // Only speak if it's very recent to prevent interference
    if (v && v.text && Date.now() - (v.at||0) < 30000) {
      speakNow(v.text);
    }
  }
});

// ---------- Gentle nudges + live line updates ----------
let customLines = [];
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === 'NUDGE') {
    chrome.storage.local.get([KEYS.LINES], (cfg)=>{
      const customLines = Array.isArray(cfg[KEYS.LINES]) ? cfg[KEYS.LINES] : [];
      const randomLine = getRandomLine(customLines);
      speakNow(randomLine);
    });
  } else if (msg?.type === 'LINES_UPDATED' && Array.isArray(msg.lines)) {
    customLines = msg.lines;
  }
});

// ---------- BRIDGE: accept messages from the Control Panel web page ----------
window.addEventListener('message', (e) => {
  const data = e?.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'PET_ADD_LINES' && Array.isArray(data.lines)) {
    const cleaned = data.lines.map(s => String(s).trim()).filter(Boolean);
    // Replace lines completely instead of merging to fix clearing bug
    chrome.storage.local.set({ [KEYS.LINES]: cleaned }, () => {
      const last = cleaned[cleaned.length - 1] || '';
      if (last) {
        // Don't set petSpeakNow storage, just speak directly
        speakNow(last); // immediate feedback on the control page only
      }
      // the bg.js onChanged fan-out will notify other tabs
      window.postMessage({ type: 'PET_LINES_RESPONSE', ok: true, lines: cleaned }, '*');
    });
  }

  if (data.type === 'PET_SET_AVATAR' && typeof data.file === 'string') {
    const file = data.file;
    setAvatar(file); // instant on this page
    chrome.storage.local.set({ [KEYS.AVATAR]: file });
  }

  if (data.type === 'PET_SAY_NOW' && typeof data.text === 'string' && data.text.trim()) {
    const text = data.text.trim();
    // For direct speech requests, set storage and speak
    chrome.storage.local.set({ [KEYS.SPEAK]: { text, at: Date.now() } });
    speakNow(text);
  }

  if (data.type === 'PET_RESCHEDULE') {
    // Forward reschedule request to background script
    chrome.runtime.sendMessage({ type: 'PET_RESCHEDULE' });
  }

  if (data.type === 'PET_TIMER_COMPLETE') {
    // Timer finished - clear any pending speech and speak timer completion immediately
    chrome.storage.local.remove([KEYS.SPEAK]);
    speakNow("Times up. Great focus!");
  }
});
