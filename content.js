// Inject only in top frame
if (window.top !== window) { /* skip iframes */ } else (function install() {
  if (document.documentElement.dataset.petInstalled === "1") return;
  document.documentElement.dataset.petInstalled = "1";

  const root = document.createElement("div");
  root.id = "pet-root";
  document.documentElement.appendChild(root);

  const DEFAULT_AVATAR = "brown_dog_nobg.png";
  const urlFor = (name) => chrome.runtime.getURL("assets/" + (name || DEFAULT_AVATAR));

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

  const wrap   = root.querySelector(".pet-wrap");
  const avatar = root.querySelector("#pet-avatar");
  const bubble = root.querySelector("#pet-bubble");
  const textEl = root.querySelector("#pet-text");

  function setAvatar(name) {
    try { avatar.style.backgroundImage = `url(${urlFor(name)})`; } catch {}
  }
  function showBubble(txt) {
    if (!txt) return;
    textEl.textContent = txt;
    bubble.classList.add("show");
    positionBubble();
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => bubble.classList.remove("show"), 5000);
  }

  // Initial avatar
  chrome.storage.local.get(["petAvatar"], (cfg) => setAvatar(cfg?.petAvatar || DEFAULT_AVATAR));

  // React to bg + storage updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PET_AVATAR_CHANGED" && typeof msg.name === "string") setAvatar(msg.name);
    else if (msg?.type === "NUDGE") showBubble(msg.payload || randomLine());
    else if (msg?.type === "PET_SAY" && typeof msg.text === "string") showBubble(msg.text);
    else if (msg?.type === "LINES_UPDATED" && Array.isArray(msg.lines)) customLines = msg.lines;
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.petAvatar) setAvatar(ch.petAvatar.newValue || DEFAULT_AVATAR);
    if (ch.petCustomLines)
      customLines = Array.isArray(ch.petCustomLines.newValue) ? ch.petCustomLines.newValue : [];
    if (ch.petSpeakNow) {
      const v = ch.petSpeakNow.newValue;
      if (v && typeof v.text === "string" && typeof v.at === "number") {
        if (Date.now() - v.at < 10000) showBubble(v.text);
      }
    }
  });

  // --- bubble layout ---
  function positionBubble() {
    const rect = wrap.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;
    const preferRight = spaceRight >= 220 || spaceRight > spaceLeft;
    bubble.classList.toggle("right", preferRight);
    bubble.classList.toggle("left", !preferRight);
    const v = getComputedStyle(wrap).getPropertyValue("--mouth-y").trim();
    const mouthY = Number.parseInt(v || "22", 10);
    const POINTER_OFFSET = 12, TAIL_ADJUST = 6;
    bubble.style.top = `${Math.max(0, mouthY - POINTER_OFFSET)}px`;
    bubble.style.setProperty("--tail-y", `${mouthY - TAIL_ADJUST}px`);
  }
  window.addEventListener("resize", positionBubble);

  // --- simple line picker for nudges ---
  let customLines = [];
  const STOCK = [
    "Tiny step now — future you says thanks.",
    "Focus for a minute, then we celebrate!",
    "You’ve got this. One paw at a time 🐾"
  ];
  function randomLine() {
    const src = customLines && customLines.length ? customLines : STOCK;
    return src[Math.floor(Math.random() * src.length)];
  }
})();
