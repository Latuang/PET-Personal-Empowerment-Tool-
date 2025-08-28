if (!window.__pet_injected__) {
  window.__pet_injected__ = true;
  console.log("[PET] content script injected");

  // --- DOM -------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'pet-root';
  document.documentElement.appendChild(root);

  root.innerHTML = `
    <div id="pet-wrap">
      <div class="pet-avatar" id="pet-avatar"
           style="background-image:url(${chrome.runtime.getURL('assets/pet.png')});"
           title="Drag me or click me for a pep"></div>
      <div class="pet-bubble right" id="pet-bubble" role="status" aria-live="polite">
        <div id="pet-text">Hi! I’m PET. Click me for a pep!</div>
      </div>
    </div>
  `;

  const wrap   = document.getElementById('pet-wrap');
  const avatar = document.getElementById('pet-avatar');
  const bubble = document.getElementById('pet-bubble');
  const textEl = document.getElementById('pet-text');

  // --- Drag whole widget by the avatar ---------------------------------------
  (function drag(handle, container) {
    let down = false, sx=0, sy=0, sl=0, st=0;
    const getPos = () => container.getBoundingClientRect();
    const onDown = (e) => {
      down = true;
      handle.style.cursor = 'grabbing';
      const { left, top } = getPos();
      sl = left; st = top; sx = e.clientX; sy = e.clientY;
      e.preventDefault();
      bubble.classList.remove('show'); // hide while dragging
    };
    const onMove = (e) => {
      if (!down) return;
      container.style.position = 'fixed';
      container.style.left = `${sl + (e.clientX - sx)}px`;
      container.style.top  = `${st + (e.clientY - sy)}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    };
    const onUp = () => { down = false; handle.style.cursor = 'grab'; };
    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  })(avatar, root);

  // --- Messages ---------------------------------------------------------------
  const DEFAULTS = [
    "Small steps still move you forward.",
    "Momentum beats motivation—start tiny.",
    "25-minute focus, then breathe. You’ve got this.",
    "Done > perfect. One micro-step now.",
    "Future you will thank you for this."
  ];
  let customLines = [];
  chrome.storage.sync.get(['petCustomLines'], (cfg) => {
    if (Array.isArray(cfg.petCustomLines)) customLines = cfg.petCustomLines;
  });

  // --- Bubble placement logic -------------------------------------------------
  const AVATAR = 72;                 // keep in sync with CSS --avatar
  const GAP    = 10;
  const MARGIN = 8;

  function placeBubble() {
    // We want the tail to come from the dog's mouth.
    // Approx mouth Y ≈ 55% of avatar height (tweak to taste).
    const mouthY = Math.round(AVATAR * 0.55);

    // Ensure bubble is measurable
    bubble.style.visibility = 'hidden';
    bubble.classList.add('show');

    const rectBubble = bubble.getBoundingClientRect();
    const rectRoot   = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer right side; fall back to left if not enough space
    let useRight = (rectRoot.right + GAP + rectBubble.width + MARGIN < vw);
    bubble.classList.toggle('right', useRight);
    bubble.classList.toggle('left', !useRight);

    // Horizontal position relative to wrap
    if (useRight) {
      bubble.style.left = (AVATAR + GAP) + 'px';
      bubble.style.right = '';
    } else {
      bubble.style.right = (AVATAR + GAP) + 'px';
      bubble.style.left = '';
    }

    // Vertical: center bubble on mouth, then clamp to viewport
    let topRel = mouthY - rectBubble.height / 2;                       // relative to wrap
    let absTop = rectRoot.top + topRel;                                // absolute on page
    absTop = Math.max(MARGIN, Math.min(vh - rectBubble.height - MARGIN, absTop));
    topRel = absTop - rectRoot.top;
    bubble.style.top = `${Math.round(topRel)}px`;

    // Set the tail position inside the bubble so it touches the mouth
    const tailY = Math.round(mouthY - topRel - 8); // 8 = triangle half-height tweak
    bubble.style.setProperty('--tail-y', `${Math.max(10, Math.min(rectBubble.height - 18, tailY))}px`);

    bubble.style.visibility = '';
  }

  // --- Show/hide with natural timing -----------------------------------------
  let timer = null;
  function showBubble(text) {
    textEl.textContent = text;
    placeBubble();
    bubble.classList.add('show');
    bubble.classList.remove('fadeout');

    // Natural reading time (3–8s based on length)
    const msPerChar = 55;
    const dur = Math.max(3000, Math.min(8000, text.length * msPerChar));
    clearTimeout(timer);
    timer = setTimeout(() => {
      bubble.classList.add('fadeout');
      setTimeout(() => bubble.classList.remove('show'), 220);
    }, dur);
  }

  // --- Interaction: pet the dog for a pep ------------------------------------
  avatar.addEventListener('click', () => {
    const pool = [...DEFAULTS, ...customLines];
    const line = pool[Math.floor(Math.random() * pool.length)] || "One tiny step now.";
    showBubble(line);
  });

  // Keep placement correct on resize
  window.addEventListener('resize', () => {
    if (bubble.classList.contains('show')) placeBubble();
  });

  // Background nudges from service worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'NUDGE') {
      const pool = [...DEFAULTS, ...customLines];
      const text = msg.payload || pool[Math.floor(Math.random() * pool.length)];
      showBubble(text);
    }
  });

  // Friendly hello so you can confirm injection
  setTimeout(() => showBubble("PET is ready 🐶 — click me for a pep!"), 600);
}
