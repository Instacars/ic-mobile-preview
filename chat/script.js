(() => {
  const chat = document.querySelector("[data-chat]");
  const dock = document.querySelector(".dock");
  const form = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-input]");
  const sendBtn = form.querySelector(".composer__send");

  /* ---------- Kaia backend ----------
     Same protocol as the app's /chat page (kaia-frontend useWebSocket + Chat.tsx):
     POST {api}/chats -> { id }, optional GET {api}/auth/token, then a WebSocket at {ws}/{id}.
     Send {type:"message", text, metadata?}; receive stream_start / stream_chunk / stream_end
     (the reply text), "suggestion" (cars), message type "options" (follow-up chips), "error".
     The backend only accepts instacars.io sites, so other hosts (e.g. the GitHub preview) stay offline. */
  const BACKENDS = {
    "dev.instacars.io": { api: "https://kaia-dev.instacars.io", ws: "wss://kaia-dev.instacars.io/chats" },
  };
  const backend = BACKENDS[location.hostname] || null;

  /* Keep the conversation clear of the pinned composer */
  const fitDock = () => document.documentElement.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
  fitDock();
  window.addEventListener("resize", fitDock);
  /* Open on the latest message, like a chat app (matters on shorter screens) */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, document.documentElement.scrollHeight));

  /* Composer grows with its text (up to 5 lines); the send button darkens once there's something to send */
  const grow = () => {
    input.style.height = "24px";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    sendBtn.classList.toggle("is-ready", input.value.trim().length > 0);
    fitDock();
  };
  input.addEventListener("input", grow);
  grow();

  /* Voice input on the mic button (shared with the homepage: ../voice-input.js) */
  if (window.KaiaVoice) KaiaVoice.attach({ mic: document.querySelector("[data-mic]"), input, status: document.querySelector("[data-voice-status]"), onChange: grow });

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
  const toBottom = (force) => { if (force || nearBottom()) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); };
  const add = el => { chat.appendChild(el); return el; };
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  /* Reply sound uses the supplied notification audio, unlocked by the first interaction. */
  let replyAudio = null;
  let replyAudioReady = false;
  let replySoundBuffer = null;
  let replySoundLoad = null;
  const unlockReplyAudio = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve();
    try {
      if (!replyAudio) replyAudio = new AudioContextClass();
      if (replyAudio.state === "suspended") {
        return replyAudio.resume().then(() => { replyAudioReady = replyAudio.state === "running"; }).catch(() => {});
      }
      replyAudioReady = replyAudio.state === "running";
      return Promise.resolve();
    } catch (e) { /* Audio is optional; chat still works if unavailable. */ return Promise.resolve(); }
  };
  const playReplySound = () => {
    if (!replyAudio || !replyAudioReady || replyAudio.state !== "running") return;
    if (!replySoundLoad) {
      replySoundLoad = fetch(new URL("assets/mixkit-dry-pop-up-notification-alert-2356.wav", document.baseURI))
        .then(response => { if (!response.ok) throw new Error("Reply sound unavailable"); return response.arrayBuffer(); })
        .then(data => replyAudio.decodeAudioData(data))
        .then(buffer => { replySoundBuffer = buffer; return buffer; })
        .catch(() => null);
    }
    replySoundLoad.then(buffer => {
      if (!buffer || !replyAudioReady || replyAudio.state !== "running") return;
      const source = replyAudio.createBufferSource();
      const volume = replyAudio.createGain();
      source.buffer = buffer;
      volume.gain.value = 0.8;
      source.connect(volume);
      volume.connect(replyAudio.destination);
      source.start();
    });
  };

  /* Small, safe Markdown for Kaia's replies: paragraphs, **bold**, *italic*, bullet/numbered lists, links */
  const inline = s => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const markdown = text => {
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(text).split("\n")) {
      const line = raw.trimEnd();
      const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        const kind = ul ? "ul" : "ol";
        if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
      } else if (!line.trim()) { close(); }
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
    return out.join("");
  };

  /* ---------- Rendering ---------- */
  const userRow = text => add(el(`<div class="msg msg--me msg--new"><p class="bubble bubble--me">${escapeHtml(text)}</p><img class="avatar" src="assets/avatar-user.jpg" width="32" height="32" alt="You" /></div>`));
  const kaiaRow = (inner, extra = "") => add(el(`<div class="msg msg--kaia msg--new ${extra}"><img class="avatar" src="assets/avatar-kaia.png" width="32" height="32" alt="Kaia" /><div class="msg__stack">${inner}</div></div>`));
  const noteRow = text => add(el(`<p class="chat__note">${escapeHtml(text)}</p>`));

  const money = n => Number(n) > 0 ? `$${Math.round(Number(n)).toLocaleString("en-US")}` : "";
  const carCard = car => {
    const info = [car.fuelType, car.drivetrain, car.transmission].filter(Boolean).map(escapeHtml).join("<i></i>");
    const a = el(`<a class="car" href="#">
        <img class="car__img" src="${escapeHtml(car.imgURL || "")}" width="255" height="175" alt="${escapeHtml(car.title || "Car")}" loading="lazy" />
        <span class="car__title">${escapeHtml(car.title || "")}</span>
        <span class="car__info">${info}</span>
        <span class="car__price">${money(car.sellingPrice)}</span>
      </a>`);
    /* A dealer's photo that won't load (or no photo at all) becomes a plain "No photo" tile */
    const img = a.querySelector("img");
    const noPhoto = () => img.replaceWith(el(`<span class="car__img car__img--none">No photo</span>`));
    if (!car.imgURL) noPhoto(); else img.addEventListener("error", noPhoto, { once: true });
    a.addEventListener("click", e => { e.preventDefault(); selectedCar = car; send(`I want to know more about ${car.title}.`, { car_id: car.id }); });
    return a;
  };
  const carousel = cars => {
    const section = el(`<section class="cars msg--new" aria-label="Suggested cars" data-carousel>
        <div class="cars__row" data-track></div>
        <button type="button" class="cars__btn cars__btn--prev" aria-label="Previous cars" data-prev><img src="assets/chevron-right.svg" width="24" height="24" alt="" /></button>
        <button type="button" class="cars__btn cars__btn--next" aria-label="Next cars" data-next><img src="assets/chevron-right.svg" width="24" height="24" alt="" /></button>
        <div class="cars__dots" data-dots></div>
      </section>`);
    const track = section.querySelector("[data-track]");
    cars.forEach(c => track.appendChild(carCard(c)));
    add(section);
    initCarousel(section);
    return section;
  };
  const quickReplies = options => {
    const ul = add(el(`<ul class="tokens tokens--reply msg--new" aria-label="Quick replies"></ul>`));
    options.forEach(o => {
      const li = document.createElement("li");
      const b = el(`<button type="button" class="token">${escapeHtml(o)}</button>`);
      b.addEventListener("click", () => send(o, selectedCar ? { car_id: selectedCar.id } : null));
      li.appendChild(b); ul.appendChild(li);
    });
  };
  const imageStrip = urls => kaiaRow(`<div class="chat__images">${urls.slice(0, 6).map(u => `<img src="${escapeHtml(u)}" alt="" loading="lazy" />`).join("")}</div>`);

  /* ---------- Conversation with Kaia ---------- */
  let socket = null, chatId = null, connecting = null, heartbeat = null, closedOnPurpose = false;
  let selectedCar = null, waiting = false, typingRow = null, streamRow = null, streamText = "";
  const queue = [];

  const setWaiting = on => {
    waiting = on;
    sendBtn.disabled = on;
    chat.setAttribute("aria-busy", String(on));
    if (on && !typingRow) { typingRow = kaiaRow(`<p class="bubble bubble--kaia bubble--typing" aria-label="Kaia is typing"><i></i><i></i><i></i></p>`); toBottom(true); }
    if (!on && typingRow) { typingRow.remove(); typingRow = null; }
  };
  const dropTyping = () => { if (typingRow) { typingRow.remove(); typingRow = null; } };

  const onFrame = data => {
    if (data.type === "ping_pong") return;
    const m = data.message || {};
    if (data.type === "stream_start") { dropTyping(); streamText = ""; streamRow = kaiaRow(`<div class="bubble bubble--kaia bubble--reply"></div>`); return; }
    if (data.type === "stream_chunk") {
      if (!streamRow) { dropTyping(); streamRow = kaiaRow(`<div class="bubble bubble--kaia bubble--reply"></div>`); }
      streamText += m.content || "";
      streamRow.querySelector(".bubble").innerHTML = markdown(streamText);
      toBottom(); return;
    }
    if (data.type === "stream_end") {
      if (streamRow && streamText.trim()) playReplySound();
      streamRow = null;
      if (data.is_last) setWaiting(false);
      return;
    }
    if (data.type === "error") { setWaiting(false); noteRow("Kaia couldn't answer that. Please try again."); toBottom(true); return; }

    if (data.type === "suggestion" || m.type === "suggestion") {
      dropTyping();
      if (Array.isArray(m.content) && m.content.length) carousel(m.content);
    } else if (m.type === "options" && Array.isArray(m.content) && m.content.length) {
      quickReplies(m.content);
    } else if (m.type === "show_images" && Array.isArray(m.content) && m.content.length) {
      dropTyping(); imageStrip(m.content);
    } else if (data.type === "book_appointment" || m.type === "book_appointment") {
      dropTyping(); noteRow("Booking a test drive isn't available on this page yet.");
    } else if (m.type === "message" && m.content) {
      dropTyping(); kaiaRow(`<div class="bubble bubble--kaia bubble--reply">${markdown(m.content)}</div>`); playReplySound();
    }
    if (data.is_last) setWaiting(false);
    toBottom();
  };

  const connect = () => {
    if (socket && socket.readyState <= 1) return connecting || Promise.resolve();
    connecting = (async () => {
      if (!chatId) {
        const r = await fetch(`${backend.api}/chats`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
        if (!r.ok) throw new Error(`chats ${r.status}`);
        chatId = (await r.json()).id;
        if (!chatId) throw new Error("no chat id");
      }
      let token = null;
      try { const t = await fetch(`${backend.api}/auth/token`, { credentials: "include" }); if (t.ok) token = (await t.json()).token; } catch (e) { /* anonymous */ }
      await new Promise((resolve, reject) => {
        closedOnPurpose = false;
        socket = new WebSocket(`${backend.ws}/${encodeURIComponent(chatId)}${token ? `?token=${encodeURIComponent(token)}` : ""}`);
        socket.onopen = () => {
          clearInterval(heartbeat);
          heartbeat = setInterval(() => { if (socket.readyState === 1) socket.send(JSON.stringify({ type: "ping_pong" })); }, 60000);
          while (queue.length) socket.send(queue.shift());
          resolve();
        };
        socket.onmessage = e => { try { onFrame(JSON.parse(e.data)); } catch (err) { /* ignore malformed frames */ } };
        socket.onerror = () => reject(new Error("socket"));
        socket.onclose = () => { clearInterval(heartbeat); if (!closedOnPurpose && chatId) setTimeout(() => connect().catch(() => {}), 1000); };
      });
    })().finally(() => { connecting = null; });
    return connecting;
  };

  const disconnect = () => { closedOnPurpose = true; clearInterval(heartbeat); if (socket) socket.close(); socket = null; chatId = null; queue.length = 0; };

  /* ---------- Sending ---------- */
  let started = false; // first message replaces the design's sample conversation
  const clearChat = () => { chat.querySelectorAll(".msg, .cars, .actions, .tokens--reply, .chat__note").forEach(n => n.remove()); };

  const send = (text, metadata = null) => {
    text = String(text || "").trim();
    if (!text || waiting) return;
    unlockReplyAudio();
    if (!started) { started = true; clearChat(); }
    userRow(text);
    document.dispatchEvent(new CustomEvent("kaia:message", { detail: { message: text } }));
    toBottom(true);
    if (!backend) {
      if (!chat.querySelector(".chat__note")) {
        const note = noteRow("Kaia isn't connected on this preview. Try it on dev.instacars.io.");
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "chat__sound-preview";
        preview.textContent = "Hear the sound";
        preview.addEventListener("click", () => { unlockReplyAudio().then(playReplySound); });
        note.append(" ", preview);
      }
      return;
    }
    const payload = JSON.stringify(metadata ? { type: "message", text, metadata } : { type: "message", text });
    setWaiting(true);
    if (socket && socket.readyState === 1) socket.send(payload);
    else { queue.push(payload); connect().catch(() => { queue.length = 0; setWaiting(false); noteRow("Couldn't reach Kaia right now. Please try again in a moment."); }); }
  };

  form.addEventListener("submit", e => { e.preventDefault(); const t = input.value; if (!t.trim() || waiting) return; send(t); input.value = ""; grow(); input.focus(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  document.querySelectorAll("[data-fill]").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.fill; grow(); input.focus(); }));
  document.querySelectorAll("[data-send-text]").forEach(b => b.addEventListener("click", () => send(b.dataset.sendText)));

  /* "New search" clears the conversation and starts a new chat with Kaia on the next message */
  document.querySelector("[data-new-search]").addEventListener("click", e => {
    e.preventDefault();
    disconnect(); setWaiting(false); clearChat();
    started = true; selectedCar = null; streamRow = null;
    input.value = ""; grow(); input.focus();
  });

  /* Thumbs up / down toggle (sample answer only; not sent anywhere yet) */
  document.querySelectorAll(".actions__btn[aria-pressed]").forEach(b => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.parentElement.querySelectorAll("[aria-pressed]").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(on));
  }));

  /* ---------- Car carousel: arrows move one card, dots show and pick the position ---------- */
  function initCarousel(c) {
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
  }
  document.querySelectorAll("[data-carousel]").forEach(initCarousel);

  /* Arriving from the marketplace homepage search box (chat/index.html#q=...): start the
     conversation with that message instead of the sample one. */
  const first = new URLSearchParams(location.hash.slice(1)).get("q");
  if (first && first.trim()) {
    history.replaceState(null, "", location.pathname + location.search); // tidy the address bar
    send(first.slice(0, 2000));
    input.focus();
  }
})();
