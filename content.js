// Top-frame only; never inject in iframes/ads
if (window.top !== window) { /* don’t inject inside iframes/ads */ }
else {
  (function install() {
    // Prevent duplicate injection
    if (document.documentElement.dataset.petInstalled === "1") return;
    document.documentElement.dataset.petInstalled = "1";

    // Create root
    const root = document.createElement("div");
    root.id = "pet-root";
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

    // --- Bubble placement ---
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

    // --- Lines store ---
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

    const randomLine = () => {
      const pool = [...DEFAULTS, ...customLines];
      return pool[Math.floor(Math.random() * pool.length)] || "You’ve got this.";
    };

    // --- Show/hide bubble ---
    let hideTimer = null;
    function showBubble(text) {
      positionBubble();
      textEl.textContent = text;
      bubble.classList.add('show');
      bubble.classList.remove('fadeout');

      const msPerChar = 55;
      const dur = Math.max(2500, Math.min(8000, text.length * msPerChar));
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        bubble.classList.add('fadeout');
        setTimeout(() => bubble.classList.remove('show'), 220);
      }, dur);
    }

    // --- Click vs Drag (robust: no disappearing on click) ---
    (function enableDrag(handle, container) {
      const DRAG_THRESHOLD = 4; // px
      let dragging = false, down = false;
      let sx=0, sy=0, sl=0, st=0;

      const onDown = (e) => {
        down = true; dragging = false;
        handle.style.cursor = 'grabbing';
        const r = container.getBoundingClientRect();
        sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
        e.preventDefault();
        e.stopPropagation();
      };

      const onMove = (e) => {
        if (!down) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
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
        if (!dragging) { // click
          e.preventDefault(); e.stopPropagation();
          showBubble(randomLine());
        }
      };

      handle.addEventListener('mousedown', onDown, { passive:false });
      window.addEventListener('mousemove', onMove, { passive:true });
      window.addEventListener('mouseup', onUp, { passive:true });

      // Keyboard / accessibility click
      handle.addEventListener('click', (e) => {
        if (!dragging) { e.stopPropagation(); showBubble(randomLine()); }
      });
    })(avatar, root);

    // --- Runtime messages from background ---
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'NUDGE') {
        showBubble(randomLine());
      } else if (msg?.type === 'PET_SAY' && typeof msg.text === 'string') {
        showBubble(msg.text);
      } else if (msg?.type === 'LINES_UPDATED' && Array.isArray(msg.lines)) {
        // Adopt the new list immediately
        customLines = msg.lines.slice();
      }
    });

    // --- Storage mirror (also catches missed messages) ---
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

    // Keep alive if site rewrites DOM
    const mo = new MutationObserver(() => {
      if (!document.getElementById('pet-root')) {
        document.documentElement.appendChild(root);
      }
    });
    mo.observe(document.documentElement, { childList: true });

    // Initial alignment
    positionBubble();
  })();
}
