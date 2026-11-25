(() => {
  const chat = document.querySelector("[data-chat]");
  const dock = document.querySelector(".dock");
  const form = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-input]");

  /* Keep the conversation clear of the pinned composer */
  const fitDock = () => document.documentElement.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
  fitDock();
  window.addEventListener("resize", fitDock);
  /* Open on the latest message, like a chat app (matters on shorter screens) */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, document.documentElement.scrollHeight));

  /* Composer grows with its text (up to 5 lines) */
  const grow = () => { input.style.height = "24px"; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; fitDock(); };
  input.addEventListener("input", grow);
  grow();

  /* Sending adds the message to the conversation. Not connected to Kaia yet:
     listen for the "kaia:message" event on document to wire it up. */
  const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const send = text => {
    text = text.trim();
    if (!text) return;
    const row = document.createElement("div");
    row.className = "msg msg--me msg--new";
    row.innerHTML = `<p class="bubble bubble--me">${escapeHtml(text)}</p><img class="avatar" src="assets/avatar-user.jpg" width="32" height="32" alt="You" />`;
    chat.appendChild(row);
    document.dispatchEvent(new CustomEvent("kaia:message", { detail: { message: text } }));
    row.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  form.addEventListener("submit", e => { e.preventDefault(); send(input.value); input.value = ""; grow(); input.focus(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  document.querySelectorAll("[data-fill]").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.fill; grow(); input.focus(); }));
  document.querySelectorAll("[data-send-text]").forEach(b => b.addEventListener("click", () => send(b.dataset.sendText)));

  /* "New search" (and ⌘N / Ctrl+N would open a new browser window, so only the link) clears the conversation */
  const clearChat = () => {
    chat.querySelectorAll(".msg, .cars, .actions, .tokens--reply").forEach(n => n.remove());
    input.value = ""; grow();
  };
  document.querySelector("[data-new-search]").addEventListener("click", e => {
    e.preventDefault();
    clearChat(); input.focus();
  });

  /* Arriving from the marketplace homepage search box (chat/index.html#q=...): start a fresh
     conversation with that message instead of the sample one. */
  const first = new URLSearchParams(location.hash.slice(1)).get("q");
  if (first && first.trim()) {
    clearChat();
    history.replaceState(null, "", location.pathname + location.search); // tidy the address bar
    send(first.slice(0, 2000));
    input.focus();
  }

  /* Thumbs up / down toggle */
  document.querySelectorAll(".actions__btn[aria-pressed]").forEach(b => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.parentElement.querySelectorAll("[aria-pressed]").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(on));
  }));

  /* Car carousel: arrows move one card, dots show and pick the position */
  document.querySelectorAll("[data-carousel]").forEach(c => {
    const track = c.querySelector("[data-track]");
    const cards = [...track.children];
    const prev = c.querySelector("[data-prev]");
    const next = c.querySelector("[data-next]");
    const dots = c.querySelector("[data-dots]");
    const step = () => cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;
    cards.forEach((_, i) => {
      const d = document.createElement("button");
      d.type = "button";
      d.setAttribute("aria-label", `Go to car ${i + 1}`);
      d.addEventListener("click", () => track.scrollTo({ left: Math.min(i * step(), track.scrollWidth - track.clientWidth) }));
      dots.appendChild(d);
    });
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 1;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= max;
      const i = track.scrollLeft >= max ? cards.length - 1 : Math.round(track.scrollLeft / step());
      [...dots.children].forEach((d, j) => d.setAttribute("aria-current", String(j === i)));
    };
    prev.addEventListener("click", () => track.scrollBy({ left: -step() }));
    next.addEventListener("click", () => track.scrollBy({ left: step() }));
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    update();
  });
})();
