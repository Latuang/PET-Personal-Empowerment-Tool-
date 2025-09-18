// Inject only in top frame
if (window.top !== window) { /* skip iframes */ } else (function install() {
  if (document.documentElement.dataset.petInstalled === "1") return;
  document.documentElement.dataset.petInstalled = "1";

  const root = document.createElement("div");
  root.id = "pet-root";
  document.documentElement.appendChild(root);

  const DEFAULT_AVATAR = 'brown_dog_nobg.png';
  const urlFor = (name) => chrome.runtime.getURL('assets/' + (name || DEFAULT_AVATAR));

  root.innerHTML = `
    <div class="pet-wrap">
      <div class="pet-avatar" id="pet-avatar"
           style="background-image:url(${urlFor(DEFAULT_AVATAR)});"
           title="Drag or click me"></div>
      <div class="pet-bubble right" id="pet-bubble" role="status" aria-live="polite">
        <div id="pet-text">Hi! I’m PET. Need a nudge?</div>
      </div>
    </div>
  `;

  const wrap   = root.querySelector('.pet-wrap');
  const avatar = root.querySelector('#pet-avatar');
  const bubble = root.querySelector('#pet-bubble');
  const textEl = root.querySelector('#pet-text');

  function setAvatar(name) { avatar.style.backgroundImage = `url(${urlFor(name)})`; }

  // Load saved avatar on start
  chrome.storage.local.get(['petAvatar'], (cfg) => setAvatar(cfg.petAvatar || DEFAULT_AVATAR));

  // React to bg + storage updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'PET_AVATAR_CHANGED' && typeof msg.name === 'string') setAvatar(msg.name);
    else if (msg?.type === 'NUDGE') showBubble(msg.payload || randomLine());
    else if (msg?.type === 'PET_SAY' && typeof msg.text === 'string') showBubble(msg.text);
    else if (msg?.type === 'LINES_UPDATED' && Array.isArray(msg.lines)) customLines = msg.lines;
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.petAvatar) setAvatar(ch.petAvatar.newValue || DEFAULT_AVATAR);
    if (ch.petCustomLines) customLines = Array.isArray(ch.petCustomLines.newValue) ? ch.petCustomLines.newValue : [];
    if (ch.petSpeakNow) {
      const v = ch.petSpeakNow.newValue;
      if (v && typeof v.text === 'string' && typeof v.at === 'number') {
        if (Date.now() - v.at < 10_000) showBubble(v.text);
      }
    }
  });

  // --- bubble render ---
  function positionBubble() {
    const rect = wrap.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;
    const preferRight = spaceRight >= 220 || spaceRight > spaceLeft;
    bubble.classList.toggle('right', preferRight);
    bubble.classList.toggle('left', !preferRight);
    const v = getComputedStyle(wrap).getPropertyValue('--mouth-y').trim();
    const mouthY = Number.parseInt(v || '22', 10);
    const POINTER_OFFSET = 12, TAIL_ADJUST = 6;
    bubble.style.top = `${Math.max(0, mouthY - POINTER_OFFSET)}px`;
    bubble.style.setProperty('--tail-y', `${mouthY - TAIL_ADJUST}px`);
  }

  const DEFAULTS = [
    "Small steps still move you forward.",
    "Momentum beats motivation—start tiny.",
    "25-minute focus, then breathe. You’ve got this.",
    "Done > perfect. One micro-step now.",
    "Future you will thank you for this."
  ];
  let customLines = [];
  chrome.storage.local.get(['petCustomLines'], (cfg) => {
    if (Array.isArray(cfg.petCustomLines)) customLines = cfg.petCustomLines;
  });
  const randomLine = () => {
    const pool = [...DEFAULTS, ...customLines];
    return pool[Math.floor(Math.random() * pool.length)] || "You’ve got this.";
  };

  let hideTimer = null;
  function showBubble(text) {
    positionBubble();
    textEl.textContent = text;
    bubble.classList.add('show');
    bubble.classList.remove('fadeout');
    const msPerChar = 55;
    const dur = Math.max(2200, Math.min(7000, text.length * msPerChar));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bubble.classList.add('fadeout');
      setTimeout(() => bubble.classList.remove('show'), 220);
    }, dur);
  }

  // Drag & click to speak
  (function enableDrag(handle, container) {
    const DRAG_THRESHOLD = 4;
    let dragging = false, down = false;
    let sx=0, sy=0, sl=0, st=0;
    const onDown = (e) => {
      down = true; dragging = false;
      handle.style.cursor = 'grabbing';
      const r = container.getBoundingClientRect();
      sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
      e.preventDefault(); e.stopPropagation();
    };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragging = true;
        container.style.position = 'fixed';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
      if (dragging) {
        container.style.left = `${sl + dx}px`;
        container.style.top  = `${st + dy}px`;
        positionBubble();
      }
    };
    const onUp = (e) => {
      if (!down) return;
      down = false; handle.style.cursor = 'grab';
      if (!dragging) { e.preventDefault(); e.stopPropagation(); showBubble(randomLine()); }
    };
    handle.addEventListener('mousedown', onDown, { passive:false });
    window.addEventListener('mousemove', onMove, { passive:true });
    window.addEventListener('mouseup', onUp, { passive:true });
    handle.addEventListener('click', (e) => { if (!dragging) { e.stopPropagation(); showBubble(randomLine()); } });
  })(root.querySelector('#pet-avatar'), root);

  const mo = new MutationObserver(() => {
    if (!document.getElementById('pet-root')) {
      document.documentElement.appendChild(root);
    }
  });
  mo.observe(document.documentElement, { childList: true });

  positionBubble();
})();
