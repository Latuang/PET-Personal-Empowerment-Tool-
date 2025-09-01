// Do not run inside iframes/ads
if (window.top !== window) { return; }

if (!window.__pet_injected__) {
  window.__pet_injected__ = true;

  const root = document.createElement('div');
  root.id = 'pet-root';
  document.documentElement.appendChild(root);

  root.innerHTML = `
    <div class="pet-wrap">
      <div class="pet-avatar" id="pet-avatar"
           style="background-image:url(${chrome.runtime.getURL('pet.png')});"
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

  function positionBubble() {
    const rect = wrap.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;
    const preferRight = spaceRight >= 220 || spaceRight > spaceLeft;

    bubble.classList.toggle('right', preferRight);
    bubble.classList.toggle('left', !preferRight);

    const v = getComputedStyle(wrap).getPropertyValue('--mouth-y').trim();
    const mouthY = Number.parseInt(v || '22', 10);
    const POINTER_OFFSET = 12;
    const TAIL_ADJUST = 6;

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
  chrome.storage.sync.get(['petCustomLines'], (cfg) => {
    if (Array.isArray(cfg.petCustomLines)) customLines = cfg.petCustomLines;
  });

  let timer = null;

  function showBubble(text) {
    positionBubble();
    textEl.textContent = text;
    bubble.classList.add('show');
    bubble.classList.remove('fadeout');

    const msPerChar = 55;
    const dur = Math.max(2500, Math.min(8000, text.length * msPerChar));
    clearTimeout(timer);
    timer = setTimeout(() => {
      bubble.classList.add('fadeout');
      setTimeout(() => bubble.classList.remove('show'), 220);
    }, dur);
  }

  (function drag(handle, container) {
    let down = false, sx=0, sy=0, sl=0, st=0;
    const onDown = (e) => {
      down = true; handle.style.cursor = 'grabbing';
      const r = container.getBoundingClientRect();
      sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
      container.style.position = 'fixed';
      container.style.right = 'auto'; container.style.bottom = 'auto';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!down) return;
      container.style.left = `${sl + (e.clientX - sx)}px`;
      container.style.top  = `${st + (e.clientY - sy)}px`;
      positionBubble();
    };
    const onUp = () => { down = false; handle.style.cursor = 'grab'; };

    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('resize', positionBubble);
  })(avatar, root);

  const randomLine = () => {
    const pool = [...DEFAULTS, ...customLines];
    return pool[Math.floor(Math.random() * pool.length)] || "You’ve got this.";
  };

  avatar.addEventListener('click', () => showBubble(randomLine()));

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'NUDGE') {
      showBubble(msg.payload || randomLine());
    } else if (msg?.type === 'PET_SAY' && typeof msg.text === 'string') {
      showBubble(msg.text);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.petCustomLines) {
      const next = changes.petCustomLines.newValue;
      customLines = Array.isArray(next) ? next : [];
    }
    if (changes.petSpeakNow) {
      const v = changes.petSpeakNow.newValue;
      if (v && typeof v.text === 'string' && typeof v.at === 'number') {
        if (Date.now() - v.at < 10_000) showBubble(v.text);
      }
    }
  });

  positionBubble();
}
