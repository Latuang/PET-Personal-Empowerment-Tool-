// Inject only in top frame
if (window.top !== window) {
  // skip iframes
} else (function install() {
  if (document.documentElement.dataset.petInstalled === "1") return;
  document.documentElement.dataset.petInstalled = "1";

  const root = document.createElement("div");
  root.id = "pet-root";
  document.documentElement.appendChild(root);

  root.innerHTML = `
    <div class="pet-wrap">
      <div class="pet-avatar" id="pet-avatar"
           style="background-image:url(${chrome.runtime.getURL('assets/brown_dog_nobg.png')});"
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

  // position bubble intelligently
  function positionBubble() {
    const rect = wrap.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;
    const preferRight = spaceRight >= 220 || spaceRight > spaceLeft;
    bubble.classList.toggle('right', preferRight);
    bubble.classList.toggle('left', !preferRight);
    const mouthY = 22;
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
  chrome.storage.local.get(['petCustomLines', 'petAvatar'], (cfg) => {
    if (Array.isArray(cfg.petCustomLines)) customLines = cfg.petCustomLines;
    if (cfg.petAvatar) setAvatar(cfg.petAvatar);
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

  // Drag to move; click to speak
  (function enableDrag(handle, container) {
    const DRAG_THRESHOLD = 4;
    let dragging = false, down = false;
    let sx=0, sy=0, bx=0, by=0;
    const style = container.style;
    handle.addEventListener('pointerdown', (e) => {
      down = true; dragging = false;
      sx = e.clientX; sy = e.clientY;
      const r = container.getBoundingClientRect();
      bx = r.left; by = r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging && Math.hypot(dx,dy) > DRAG_THRESHOLD) dragging = true;
      if (dragging) {
        style.position = 'fixed';
        style.left = Math.min(window.innerWidth-40, Math.max(-10, bx + dx)) + 'px';
        style.top  = Math.min(window.innerHeight-40, Math.max(-10, by + dy)) + 'px';
      }
    });
    handle.addEventListener('pointerup', (e) => {
      if (!dragging) showBubble(randomLine());
      down = false; dragging = false;
      handle.releasePointerCapture(e.pointerId);
    });
  })(avatar, wrap);

  function setAvatar(name) {
    avatar.style.backgroundImage = `url(${chrome.runtime.getURL('assets/' + name)})`;
  }

  // runtime messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'PET_SAY' && typeof msg.text === 'string') showBubble(msg.text);
    if (msg?.type === 'NUDGE') showBubble(randomLine());
    if (msg?.type === 'LINES_UPDATED' && Array.isArray(msg.lines)) customLines = msg.lines;
    if (msg?.type === 'PET_AVATAR_CHANGED' && typeof msg.name === 'string') setAvatar(msg.name);
  });
})();
