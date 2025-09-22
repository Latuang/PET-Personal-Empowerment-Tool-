// ===== Floating PET on web pages (content script) =====

if (window.top !== window) { /* no iframes */ } else (function install() {
  if (document.documentElement.dataset.petInstalled === "1") return;
  document.documentElement.dataset.petInstalled = "1";

  const KEYS = {
    AVATAR: 'petAvatar',
    LINES:  'petCustomLines',
    SPEAK:  'petSpeakNow',
    POS:    'petPos'
  };

  // --- Root, avatar, speech bubble (with a little tail) ---
  const root = document.createElement('div');
  root.id = 'pet-root';
  root.style.cssText = 'position:fixed; inset:auto 18px 18px auto; width:96px; height:96px; z-index:2147483647;';
  document.documentElement.appendChild(root);

  const avatar = document.createElement('img');
  avatar.alt = 'PET avatar';
  avatar.style.cssText = 'width:96px; height:96px; object-fit:contain; cursor:grab; filter: drop-shadow(0 6px 10px rgba(0,0,0,.18));';
  root.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.style.cssText = `
    position:absolute; bottom:90px; left:50%; transform:translateX(-50%);
    max-width:240px; background:#fff; color:#2b2723;
    border:1.5px solid #e1d6cf; border-radius:12px; padding:8px 10px;
    font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    box-shadow:0 8px 22px rgba(0,0,0,.10), 0 1px 6px rgba(0,0,0,.06);
    display:none;
  `;
  // Tail element so it looks like it's from the mouth
  const tail = document.createElement('div');
  tail.style.cssText = `
    position:absolute; bottom:-8px; left:50%; transform:translateX(-50%) rotate(45deg);
    width:14px; height:14px; background:#fff; border-left:1.5px solid #e1d6cf; border-bottom:1.5px solid #e1d6cf;
  `;
  bubble.appendChild(tail);
  const textEl = document.createElement('div');
  bubble.appendChild(textEl);
  root.appendChild(bubble);

  // --- helpers ---
  function setAvatar(file){
    if (!file) return;
    // Content script always has access to the extension package:
    avatar.src = chrome.runtime.getURL(`assets/${file}`);
  }

  function showOnce(text){
    if (!text) return;
    textEl.textContent = text;
    bubble.style.display = 'block';
    clearTimeout(showOnce._t);
    showOnce._t = setTimeout(()=> bubble.style.display = 'none', 4200);
  }

  // dragging
  (function makeDraggable(){
    let dragging = false, sx=0, sy=0, sl=0, st=0;
    avatar.addEventListener('mousedown', (e)=>{
      dragging = true; avatar.style.cursor='grabbing';
      const r = root.getBoundingClientRect(); sl=r.left; st=r.top; sx=e.clientX; sy=e.clientY;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e)=>{
      if (!dragging) return;
      const dx = e.clientX-sx, dy=e.clientY-sy;
      root.style.left = `${Math.max(0, sl+dx)}px`;
      root.style.top  = `${Math.max(0, st+dy)}px`;
      root.style.right='auto'; root.style.bottom='auto';
    }, {passive:true});
    window.addEventListener('mouseup', ()=>{
      if (!dragging) return;
      dragging=false; avatar.style.cursor='grab';
      const r = root.getBoundingClientRect();
      chrome.storage.local.set({ [KEYS.POS]: { x:r.left, y:r.top } });
    }, {passive:true});
  })();

  // cycle through saved pep lines on click
  let customLines = [];
  let idx = 0;
  function nextLine(){
    if (!customLines.length) return "You’ve got this.";
    idx = (idx + 1) % customLines.length;
    return customLines[idx];
  }
  avatar.addEventListener('click', ()=>{
    showOnce(nextLine());
  });

  // initial load
  chrome.storage.local.get([KEYS.AVATAR, KEYS.LINES, KEYS.SPEAK, KEYS.POS], (cfg)=>{
    setAvatar(cfg[KEYS.AVATAR] || 'brown_dog_nobg.png');

    const pos = cfg[KEYS.POS];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      root.style.left = pos.x + 'px';
      root.style.top  = pos.y + 'px';
      root.style.right = 'auto'; root.style.bottom = 'auto';
    }

    if (Array.isArray(cfg[KEYS.LINES])) {
      customLines = cfg[KEYS.LINES].slice();
      idx = customLines.length ? customLines.length - 1 : 0;
    }

    // say latest line once if fresh (no speech synthesis)
    const sp = cfg[KEYS.SPEAK];
    if (sp && sp.text && Date.now() - (sp.at||0) < 10_000) showOnce(sp.text);
  });

  // storage updates
  chrome.storage.onChanged.addListener((changes, area)=>{
    if (area !== 'local') return;
    if (changes[KEYS.AVATAR]) {
      setAvatar(changes[KEYS.AVATAR].newValue || 'brown_dog_nobg.png');
    }
    if (changes[KEYS.LINES]) {
      const v = changes[KEYS.LINES].newValue;
      customLines = Array.isArray(v) ? v.slice() : [];
      idx = customLines.length ? customLines.length - 1 : 0;
    }
    if (changes[KEYS.SPEAK]) {
      const v = changes[KEYS.SPEAK].newValue;
      if (v && v.text) showOnce(v.text); // <- only source of “say now” to avoid duplicates
    }
  });

  // fallback: receive manual avatar change message from control page
  window.addEventListener('message', (e)=>{
    const d = e.data;
    if (d && d.type === 'PET_SET_AVATAR' && typeof d.file === 'string') {
      setAvatar(d.file);
      chrome.storage.local.set({ [KEYS.AVATAR]: d.file });
    }
  });
})();
