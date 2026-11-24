(() => {
  const desktopMQ = window.matchMedia("(min-width: 768px)");

  /* ---------- Full-screen menu (phones, foldables, tablets) ---------- */
  const toggle = document.querySelector("[data-menu-toggle]");
  const drawer = document.querySelector("[data-drawer]");
  const closeBtn = drawer.querySelector("[data-menu-close]");
  // Lives in the header's markup, but runs from <body> so the header's slide animation can't clip it
  document.body.appendChild(drawer);
  const isOpen = () => !drawer.hidden;
  const setMenu = open => {
    if (open === isOpen()) return;
    drawer.hidden = !open;
    document.documentElement.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) { drawer.scrollTop = 0; closeBtn.focus(); }
    else toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener("click", () => setMenu(true));
  closeBtn.addEventListener("click", () => setMenu(false));
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", e => {
    if (!isOpen()) return;
    if (e.key === "Escape") setMenu(false);
    // Keep Tab focus inside the open menu
    if (e.key === "Tab") {
      const items = drawer.querySelectorAll("a, button");
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia("(min-width: 1024px)").addEventListener("change", e => { if (e.matches) setMenu(false); });

  /* ---------- Header: hide on scroll down, slide back in on scroll up (below 1024px) ---------- */
  const header = document.querySelector("[data-menu]");
  const wideMQ = window.matchMedia("(min-width: 1024px)");
  let lastY = window.scrollY, ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = Math.max(window.scrollY, 0);
    if (wideMQ.matches || isOpen()) {
      header.classList.remove("is-hidden", "is-floating");
      lastY = y;
      return;
    }
    const dy = y - lastY;
    if (Math.abs(dy) < 6) return;                 // ignore tiny jitters
    const pastHeader = y > header.offsetHeight;
    header.classList.toggle("is-hidden", dy > 0 && pastHeader);
    header.classList.toggle("is-floating", pastHeader);
    lastY = y;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  wideMQ.addEventListener("change", onScroll);
  // Keyboard users tabbing into the header should always see it
  header.addEventListener("focusin", () => header.classList.remove("is-hidden"));

  /* ---------- Tags band: chat bubbles behind the composer ----------
     Each row holds three copies of its items so no gap shows while it drifts.
     `dx` is the extra Figma offset of row 3. Row 4 only shows on phones. */
  const TAG_ROWS = [
    { y: 0,   dx: 0,  items: ["I’m looking for a reliable SUV under $40k", "Best cars under $25,000", "I want Apple CarPlay", "Best cars for a growing family", "Should I go electric?", "Show me good value cars", "AWD cars only", "I need good trunk space", "Is an EV worth it in Canada?", "Best EV for winter", "Looking for city car"] },
    { y: 43,  dx: 0,  items: ["Does this car have heated seats?", "Best hybrid cars right now", "What can I afford with a $600/month payment?", "I want something fun but practical", "How much does it cost to charge an EV?", "What’s the best family car right now?", "Which cars have heads-up display?", "Easy to drive at night"] },
    { y: 87,  dx: 90, items: ["What’s the cheapest luxury car?", "I want something fuel efficient", "Compare gas vs electric", "How far can this EV actually go?", "Are hybrids reliable?", "What incentives are available?", "Cars with low maintenance costs", "EV or plug-in hybrid?", "I commute every day, what should I get?"] },
    { y: 130, dx: 0,  items: ["I want something quiet", "I need something good for winter driving", "I drive a lot for work", "Best cars with panoramic roof", "Compare BMW vs Audi", "I want a sporty feel, not boring", "Good car for city parking", "Which is better, RAV4 or CR-V?"] },
  ];

  const tagsEl = document.querySelector("[data-tags]");
  const bubble = t => `<span class="bubble"><img class="bubble__tail" src="assets/bubble-tail.svg" alt="" /><span class="bubble__text">${t}</span></span>`;
  tagsEl.innerHTML = TAG_ROWS.map(row => {
    const set = row.items.map(bubble).join("");
    return `<div class="tags__row" style="top:${row.y}px">${set}${set}${set}</div>`;
  }).join("");
  const rowEls = [...tagsEl.children];

  // Where the first bubble of the middle copy sits, measured from the band's centre:
  // phones follow the 390px Figma frame (x = -441), wider screens the 1440px frame (x = -1233).
  const placeRows = () => {
    const start = desktopMQ.matches ? -1233 : -636;
    const centre = tagsEl.clientWidth / 2;
    rowEls.forEach((el, i) => {
      const copyW = (el.scrollWidth + 4) / 3;
      el.style.left = `${centre + start + TAG_ROWS[i].dx - copyW}px`;
    });
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(placeRows);
  window.addEventListener("resize", placeRows);

  /* ---------- Composer ---------- */
  const form = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-input]");
  const send = document.querySelector("[data-send]");
  const sync = () => send.classList.toggle("is-ready", input.value.trim().length > 0);

  input.addEventListener("input", sync);
  document.querySelectorAll("[data-fill]").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.fill;
      input.focus();
      sync();
    });
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) { input.focus(); return; }
    // Hook point: open the Kaia chat with the first message.
    document.dispatchEvent(new CustomEvent("kaia:start", { detail: { message } }));
  });

  // "Chat with Kaia" in the nav jumps to the composer.
  document.querySelectorAll("[data-chat]").forEach(link => link.addEventListener("click", e => {
    e.preventDefault();
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    input.focus({ preventScroll: true });
  }));

  /* ---------- Logo marquee: duplicate the row for a seamless loop ---------- */
  document.querySelectorAll("[data-marquee]").forEach(track => {
    const row = track.firstElementChild;
    const clone = row.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("img").forEach(img => (img.alt = ""));
    clone.querySelectorAll("[role]").forEach(el => { el.removeAttribute("role"); el.removeAttribute("aria-label"); });
    track.appendChild(clone);
  });

  /* ---------- Carousels (phones/tablets; laid out flat on wide screens) ---------- */
  document.querySelectorAll("[data-carousel]").forEach(carousel => {
    const track = carousel.querySelector("[data-track]");
    const prev = carousel.querySelector("[data-prev]");
    const next = carousel.querySelector("[data-next]");
    const step = () => track.querySelector(".card").offsetWidth + parseFloat(getComputedStyle(track).columnGap || 10);

    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    };
    prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  /* ---------- FAQ accordion ----------
     Only the second answer exists in the design. Others need copy. */
  const FAQ = [
    { q: "What is Kaia", a: null },
    { q: "How is Kaia different from a chatbot or live chat widget?", a: "Most website chat tools either route to a live agent (who isn't available at 9pm on a Tuesday) or hand back a generic script that can't answer real inventory questions. Kaia knows your actual stock and can carry a full conversation: pricing, features, financing basics, comparisons, and then push straight to a booked test drive. No human required, no \"someone will follow up.\"", open: true },
    { q: "What happens if my current website chat can't answer a question?", a: null },
    { q: "Do I need to replace my current website or CRM?", a: null },
    { q: "Who's behind Instacars?", a: null },
    { q: "How do I see it in action?", a: null },
  ];

  const faqEl = document.querySelector("[data-faq]");
  faqEl.innerHTML = FAQ.map((item, i) => `
    <div class="faq__item${item.open ? " is-open" : ""}">
      <button type="button" class="faq__q" aria-expanded="${!!item.open}" aria-controls="faq-a-${i}" id="faq-q-${i}">
        <span class="faq__q-text">${item.q}</span>
        <img class="faq__icon" src="assets/faq-down.svg" width="44" height="44" alt="" />
      </button>
      <div class="faq__a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}">
        <div><p class="${item.a ? "" : "is-placeholder"}">${item.a ?? "Answer copy needed."}</p></div>
      </div>
    </div>`).join("");

  faqEl.addEventListener("click", e => {
    const btn = e.target.closest(".faq__q");
    if (!btn) return;
    const item = btn.parentElement;
    const open = !item.classList.contains("is-open");
    faqEl.querySelectorAll(".faq__item.is-open").forEach(el => {
      el.classList.remove("is-open");
      el.querySelector(".faq__q").setAttribute("aria-expanded", "false");
    });
    if (open) {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  });

  /* ---------- Big IC mark: ShapeBlur lens (footer on phones, and the mobile menu) ---------- */
  if (window.ShapeBlur) {
    document.querySelectorAll("[data-shape-blur]").forEach(el => window.ShapeBlur(el, {
      src: "assets/ic-mark.svg",
      blur: 16,
      lensSize: 0.3,
      lensSoftness: 0.7,
      chroma: 0.3,
      idle: true,
    }));
  }

  /* ---------- Cookie banner: remembered per browser when storage is available ---------- */
  const cookie = document.querySelector("[data-cookie]");
  let choice = null;
  try { choice = localStorage.getItem("ic-cookie-choice"); } catch (_) {}
  if (!choice) cookie.hidden = false;
  cookie.querySelectorAll("[data-cookie-choice]").forEach(btn => btn.addEventListener("click", () => {
    try { localStorage.setItem("ic-cookie-choice", btn.dataset.cookieChoice); } catch (_) {}
    cookie.hidden = true;
  }));
})();
