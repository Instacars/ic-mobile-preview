(() => {
  /* ---------- Full-screen menu (below 1180px), same behaviour as the marketplace homepage ---------- */
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

  /* ---------- General / Dealer / Investor tabs ----------
     The page address remembers the tab (#dealer, #investor), so other pages can link straight to it,
     e.g. the footer's "Investors" link goes to contact/#investor. */
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  const names = tabs.map(t => t.dataset.tab);
  const pill = document.querySelector("[data-tabs-pill]");

  // Slide the white pill under the selected tab; `instant` skips the animation (first load, resizes)
  const movePill = (instant = false) => {
    const selected = tabs.find(t => t.getAttribute("aria-selected") === "true");
    if (!selected) return;
    pill.classList.toggle("is-instant", instant);
    // Exact (sub-pixel) position relative to the tab bar, so the pill lines up perfectly
    const bar = pill.parentElement.getBoundingClientRect();
    const box = selected.getBoundingClientRect();
    pill.style.width = `${box.width}px`;
    pill.style.transform = `translateX(${box.left - bar.left}px)`;
    if (instant) { pill.offsetWidth; pill.classList.remove("is-instant"); } // apply, then re-enable sliding
  };

  const showTab = (name, { focus = false, updateUrl = false, instant = false } = {}) => {
    if (!names.includes(name)) name = "general";
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panels.forEach(p => { p.hidden = p.dataset.panel !== name; });
    movePill(instant);
    if (updateUrl) history.replaceState(null, "", name === "general" ? location.pathname : `#${name}`);
  };

  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab, { updateUrl: true })));
  // Arrow keys move between tabs, as in a standard tab list
  document.querySelector("[role=tablist]").addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const current = names.indexOf(tabs.find(t => t.getAttribute("aria-selected") === "true").dataset.tab);
    const next = names[(current + (e.key === "ArrowRight" ? 1 : names.length - 1)) % names.length];
    showTab(next, { focus: true, updateUrl: true });
  });
  // Links on this page that point at a tab (footer "Investors")
  document.querySelectorAll("[data-tab-link]").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    showTab(a.dataset.tabLink, { updateUrl: true });
    document.querySelector(".tabs").scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  // Place the pill without sliding on load, and again once Poppins has loaded (tab widths change)
  showTab(location.hash.slice(1), { instant: true });
  pill.closest(".tabs").classList.add("has-pill");
  if (document.fonts) document.fonts.ready.then(() => movePill(true));
  window.addEventListener("resize", () => movePill(true));

  /* ---------- General form ----------
     No backend yet: checks the fields, screens out spam, then thanks the visitor.
     Hook point: dispatches "contact:submit" with { name, email, company, message } on document,
     only for messages that pass the spam checks below.

     Spam checks (in the browser, so they stop simple bots; whatever receives the messages
     should check again, e.g. Cloudflare Turnstile or the form service's own filter):
       1. Hidden trap field "website" must stay empty.
       2. At least 3 seconds between the page loading and sending (bots submit instantly).
       3. One message per minute from the same browser.
       4. No more than 2 links in the message.
     Bots caught by 1–2 still see the normal thank-you, so they can't tell they were blocked. */
  const form = document.querySelector("[data-contact-form]");
  const status = form.querySelector("[data-form-status]");
  const loadedAt = Date.now();
  const MIN_FILL_MS = 3000;
  const COOLDOWN_MS = 60000;
  const MAX_LINKS = 2;
  const lastSentKey = "ic-contact-last-sent";
  let lastSent = 0;
  try { lastSent = Number(localStorage.getItem(lastSentKey)) || 0; } catch (_) {}

  const thankYou = () => { status.textContent = "Thanks! We'll get back to you soon."; form.reset(); };

  form.addEventListener("submit", e => {
    e.preventDefault();
    const fields = [...form.querySelectorAll(".field__input")];
    // The browser only enforces minlength for typed text, not text a bot inserts, so check it here too
    const msg = form.querySelector("[name=message]");
    msg.setCustomValidity(msg.value.trim() && msg.value.trim().length < 10 ? "too short" : "");
    let firstBad = null;
    fields.forEach(field => {
      const bad = !field.checkValidity();
      field.setAttribute("aria-invalid", String(bad));
      if (bad && !firstBad) firstBad = field;
    });
    if (firstBad) {
      status.textContent = firstBad.name === "message" && firstBad.value.trim()
        ? "Please write a little more in your message (at least 10 characters)."
        : "Please add your name, a valid email and a message.";
      firstBad.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    // 1 + 2: likely a bot. Pretend it worked and send nothing.
    if (data.website || Date.now() - loadedAt < MIN_FILL_MS) { thankYou(); return; }
    // 3: a real person sending again too quickly
    const now = Date.now();
    if (now - lastSent < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
      status.textContent = `Thanks, we've got your message. You can send another in ${wait} seconds.`;
      return;
    }
    // 4: link-stuffed messages
    // Count each link once: a full address (http..., www...) is one match; bare domains like example.com count too
    const links = (data.message.match(/(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|ru|xyz|top|info|biz)\b/gi) || []).length;
    if (links > MAX_LINKS) {
      const box = form.querySelector("[name=message]");
      box.setAttribute("aria-invalid", "true");
      status.textContent = `Please keep links to ${MAX_LINKS} or fewer.`;
      box.focus();
      return;
    }

    delete data.website;
    document.dispatchEvent(new CustomEvent("contact:submit", { detail: data }));
    lastSent = now;
    try { localStorage.setItem(lastSentKey, String(now)); } catch (_) {}
    thankYou();
  });
  form.addEventListener("input", e => {
    e.target.removeAttribute("aria-invalid");
    if (e.target.name === "message") e.target.setCustomValidity("");
  });
})();
