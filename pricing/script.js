(() => {
  /* ---------- Full-screen menu (below 1180px), same behaviour as the other pages ---------- */
  const toggle = document.querySelector("[data-menu-toggle]");
  const drawer = document.querySelector("[data-drawer]");
  const closeBtn = drawer.querySelector("[data-menu-close]");
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

  // Close it if the window grows to desktop width, where the full nav shows
  window.matchMedia("(min-width: 1180px)").addEventListener("change", e => { if (e.matches) setMenu(false); });

  const desktop = window.matchMedia("(min-width: 1180px)");

  /* Below 1180px the card rows become swipeable strips; the arrows move them one card at a time. */
  const scrollByCard = (strip, dir) => {
    const card = strip.querySelector(".card, .feature-card-image");
    const gap = parseFloat(getComputedStyle(card.parentElement).columnGap) || 15;
    strip.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  };
  /* An arrow is disabled (and faded) when there is nothing more to show on its side */
  const setArrows = (prev, next, atStart, atEnd) => { prev.disabled = atStart; next.disabled = atEnd; };
  const stripEnds = strip => [strip.scrollLeft <= 1, strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1];

  /* ---------- Feature card carousel ----------
     The second Figma row is the initial desktop view (and the first cards shown on tablets and phones). */
  const featureTrack = document.querySelector("[data-feature-track]");
  if (featureTrack) {
    const featureSlides = [...featureTrack.querySelectorAll("[data-feature-slide]")];
    const featureStatus = document.querySelector("[data-feature-status]");
    const featurePrev = document.querySelector("[data-feature-prev]");
    const featureNext = document.querySelector("[data-feature-next]");
    let featureIndex = 1;
    const showFeatureSlide = index => {
      featureIndex = Math.max(0, Math.min(featureSlides.length - 1, index)); // stops at the first and last row
      featureTrack.style.transform = `translateX(-${featureIndex * 25}%)`;
      featureSlides.forEach((slide, i) => slide.setAttribute("aria-hidden", String(i !== featureIndex)));
      featureStatus.textContent = `Card row ${featureIndex + 1} of ${featureSlides.length}`;
      syncFeatureArrows();
    };
    const syncFeatureArrows = () => desktop.matches
      ? setArrows(featurePrev, featureNext, featureIndex === 0, featureIndex === featureSlides.length - 1)
      : setArrows(featurePrev, featureNext, ...stripEnds(strip));
    const strip = document.querySelector(".features__viewport");
    const startStrip = () => {
      if (desktop.matches) return;
      const first = featureSlides[1].firstElementChild;
      strip.scrollLeft = first.offsetLeft - parseFloat(getComputedStyle(strip).scrollPaddingLeft || 0);
    };
    featurePrev.addEventListener("click", () => desktop.matches ? showFeatureSlide(featureIndex - 1) : scrollByCard(strip, -1));
    featureNext.addEventListener("click", () => desktop.matches ? showFeatureSlide(featureIndex + 1) : scrollByCard(strip, 1));
    strip.addEventListener("scroll", syncFeatureArrows, { passive: true });
    window.addEventListener("resize", syncFeatureArrows);
    // In strip mode every card is reachable, so none is hidden from screen readers
    const syncHidden = () => featureSlides.forEach((slide, i) => slide.setAttribute("aria-hidden", String(desktop.matches && i !== featureIndex)));
    desktop.addEventListener("change", () => { syncHidden(); startStrip(); syncFeatureArrows(); });
    syncHidden();
    startStrip();
    syncFeatureArrows();
  }

  /* ---------- Dealer cards: a swipeable strip with arrows on tablets ---------- */
  const dealerTrack = document.querySelector("[data-dealer-track]");
  const dealerPrev = document.querySelector("[data-dealer-prev]");
  const dealerNext = document.querySelector("[data-dealer-next]");
  const syncDealerArrows = () => setArrows(dealerPrev, dealerNext, ...stripEnds(dealerTrack));
  dealerPrev.addEventListener("click", () => scrollByCard(dealerTrack, -1));
  dealerNext.addEventListener("click", () => scrollByCard(dealerTrack, 1));
  dealerTrack.addEventListener("scroll", syncDealerArrows, { passive: true });
  window.addEventListener("resize", syncDealerArrows);
  syncDealerArrows();

  /* ---------- "Coming soon, included": folded away on phones ---------- */
  const soonBtn = document.querySelector("[data-soon-toggle]");
  const soonCol = soonBtn.closest(".includes__col");
  const phone = window.matchMedia("(max-width: 767px)");
  const syncSoon = () => {
    // A real button only on phones; elsewhere it is just the column heading
    if (phone.matches) { soonBtn.removeAttribute("tabindex"); soonBtn.removeAttribute("aria-disabled"); }
    else { soonBtn.setAttribute("tabindex", "-1"); soonBtn.setAttribute("aria-disabled", "true"); }
  };
  soonBtn.addEventListener("click", () => {
    if (!phone.matches) return;
    const open = !soonCol.classList.contains("is-open");
    soonCol.classList.toggle("is-open", open);
    soonBtn.setAttribute("aria-expanded", String(open));
    soonBtn.querySelector("img").src = `assets/${open ? "faq-open" : "faq-closed"}.svg`;
  });
  phone.addEventListener("change", syncSoon);
  syncSoon();

  /* ---------- Billing toggle (same feel as info.instacars.io) ----------
     Annual = "2 months free": 10 × the monthly price, billed yearly, shown as its per-month price
     (Starter $2,990/yr = $249/month). A white pill slides to the chosen option, prices count to the
     new value with a short blue flash, and a "Billed …/yr · Save $…" tag appears under paid plans.
     Prices live in each .plan__num's data-monthly / data-annual attributes. */
  const group = document.querySelector("[data-billing-group]");
  const pill = group.querySelector(".billing__pill");
  const options = group.querySelectorAll("[data-billing]");
  const prices = document.querySelectorAll(".plan__num[data-monthly]");
  const saves = document.querySelectorAll(".plan__save");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const placePill = () => {
    const on = group.querySelector(".is-selected");
    pill.style.width = on.offsetWidth + "px";
    pill.style.transform = `translateX(${on.offsetLeft - 4}px)`; // 4px = the switch's inner padding
  };
  placePill();
  group.classList.add("is-ready"); // the pill takes over from the static highlight
  new ResizeObserver(placePill).observe(group);
  document.fonts?.ready.then(placePill);

  const countTo = (el, to) => {
    const from = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
    if (from === to) return;
    el.classList.remove("is-flash");
    void el.offsetWidth; // restart the flash
    el.classList.add("is-flash");
    if (reduceMotion.matches) { el.textContent = "$" + to; return; }
    const t0 = performance.now(), DURATION = 600;
    cancelAnimationFrame(el._raf);
    const step = now => {
      const t = Math.min(1, (now - t0) / DURATION);
      el.textContent = "$" + Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))); // ease-out
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };

  const setBilling = period => {
    options.forEach(opt => {
      const on = opt.dataset.billing === period;
      opt.classList.toggle("is-selected", on);
      opt.setAttribute("aria-checked", String(on));
    });
    placePill();
    prices.forEach(el => countTo(el, Number(el.dataset[period])));
    saves.forEach(el => { el.classList.toggle("is-on", period === "annual"); el.setAttribute("aria-hidden", String(period !== "annual")); });
  };
  options.forEach(opt => opt.addEventListener("click", () => setBilling(opt.dataset.billing)));
  // Arrow keys move between the two options, as in a radio group.
  group.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = [...options].find(o => !o.classList.contains("is-selected"));
    setBilling(next.dataset.billing);
    next.focus();
  });

  /* ---------- Header chat animation: people who prefer less motion see the finished conversation ---------- */
  const heroChat = document.querySelector("[data-hero-chat]");
  const syncHeroChat = () => { heroChat.src = reduceMotion.matches ? "assets/header-chat-still.webp" : "assets/header-chat.webp"; };
  reduceMotion.addEventListener("change", syncHeroChat);
  if (reduceMotion.matches) syncHeroChat();

  /* ---------- Add-on lead board video: hold on the still frame for people who prefer less motion ---------- */
  const board = document.querySelector("[data-leadboard]");
  const syncBoard = () => { if (reduceMotion.matches) { board.pause(); board.currentTime = 0; } else board.play().catch(() => {}); };
  reduceMotion.addEventListener("change", syncBoard);
  if (reduceMotion.matches) syncBoard();

  /* ---------- Contact forms (the one by the photo on phones, and the one near the end) ----------
     No backend yet: validates, then shows a confirmation. Hook point: dispatches "kaia:lead". */
  document.querySelectorAll("[data-contact]").forEach(form => {
  const status = form.querySelector("[data-status]");
  form.addEventListener("submit", e => {
    e.preventDefault();
    let firstBad = null;
    form.querySelectorAll("input").forEach(input => {
      const bad = !input.checkValidity();
      input.setAttribute("aria-invalid", String(bad));
      if (bad && !firstBad) firstBad = input;
    });
    if (firstBad) {
      status.textContent = "Please add your name and a valid email.";
      firstBad.focus();
      return;
    }
    const lead = Object.fromEntries(new FormData(form));
    document.dispatchEvent(new CustomEvent("kaia:lead", { detail: lead }));
    status.textContent = "Thanks! Our team will be in touch shortly.";
    form.reset();
  });
  form.addEventListener("input", e => e.target.removeAttribute("aria-invalid"));
  });

  /* ---------- FAQ accordion ----------
     Same questions as the marketplace homepage and the tablet/phone designs. Only the second answer exists yet. */
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
        <img class="faq__icon" src="assets/${item.open ? "faq-open" : "faq-closed"}.svg" width="44" height="44" alt="" />
      </button>
      <div class="faq__a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}">
        <div><p class="${item.a ? "" : "is-placeholder"}">${item.a ?? "Answer copy needed."}</p></div>
      </div>
    </div>`).join("");

  const setOpen = (item, open) => {
    item.classList.toggle("is-open", open);
    const btn = item.querySelector(".faq__q");
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector("img").src = `assets/${open ? "faq-open" : "faq-closed"}.svg`;
  };
  faqEl.addEventListener("click", e => {
    const btn = e.target.closest(".faq__q");
    if (!btn) return;
    const item = btn.parentElement;
    const open = !item.classList.contains("is-open");
    faqEl.querySelectorAll(".faq__item.is-open").forEach(el => setOpen(el, false));
    if (open) setOpen(item, true);
  });
})();
