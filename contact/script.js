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
     Sends messages the same way as the info.instacars.io landing page (kaia-frontend,
     app/src/app/kaia-pill/page.tsx): POST to the Kaia backend's /forms with
     { type, form: JSON string incl. recaptchaToken }, protected by Google reCAPTCHA v3.
     The backend stores the message, emails the visitor a confirmation and emails the team
     "New Marketplace Contact Submission" (reply-to = the visitor).

     Spam checks run first, in the browser (the backend then checks reCAPTCHA and rate-limits by IP):
       1. Hidden trap field "website" must stay empty.
       2. At least 3 seconds between the page loading and sending (bots submit instantly).
       3. One message per minute from the same browser.
       4. No more than 2 links in the message.
     Bots caught by 1–2 still see the normal thank-you, so they can't tell they were blocked.

     NOTE: the backend only accepts requests from instacars.io sites, and the reCAPTCHA key is
     limited to its listed domains. Until https://instacars.github.io is added to both (or this page
     moves to an instacars.io address), sending from the team preview shows the "couldn't send" error. */
  const FORMS_API = "https://kaia.instacars.io/forms";            // same backend as the landing page
  const RECAPTCHA_SITE_KEY = "6LcEpBctAAAAABbd2VteSQP6sanyNkUdxPK-wd2k"; // public site key, same as the landing page
  const FORM_TYPE = "Marketplace Contact";                        // shows as "New Marketplace Contact Submission"

  const form = document.querySelector("[data-contact-form]");
  const status = form.querySelector("[data-form-status]");
  const submitBtn = form.querySelector("[type=submit]");
  const loadedAt = Date.now();

  // Load Google reCAPTCHA v3 (invisible; shows Google's small badge, as on the landing page)
  const recaptchaScript = document.createElement("script");
  recaptchaScript.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  recaptchaScript.async = true;
  document.head.appendChild(recaptchaScript);
  const getRecaptchaToken = () => new Promise((resolve, reject) => {
    const g = window.grecaptcha;
    if (!g || !g.ready) return reject(new Error("reCAPTCHA not loaded"));
    g.ready(() => g.execute(RECAPTCHA_SITE_KEY, { action: "marketplace_contact" }).then(resolve, reject));
  });

  const setSending = on => {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Sending…" : "Submit";
    form.setAttribute("aria-busy", String(on));
  };
  const MIN_FILL_MS = 3000;
  const COOLDOWN_MS = 60000;
  const MAX_LINKS = 2;
  const lastSentKey = "ic-contact-last-sent";
  let lastSent = 0;
  try { lastSent = Number(localStorage.getItem(lastSentKey)) || 0; } catch (_) {}

  const thankYou = () => { status.textContent = "Thanks! We'll get back to you soon."; form.reset(); };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return; // already sending
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
    setSending(true);
    status.textContent = "";
    try {
      const recaptchaToken = await getRecaptchaToken();
      const res = await fetch(form.dataset.api || FORMS_API, {
        method: "POST",
        credentials: "include", // same as the landing page
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: FORM_TYPE,
          form: JSON.stringify({
            name: data.name.trim(),
            email: data.email.trim(),
            company: data.company.trim(),
            message: data.message.trim(),
            page: "Marketplace contact page",
            recaptchaToken,
          }),
        }),
      });
      if (!res.ok) {
        let message = "Something went wrong. Please try again.";
        if (res.status === 429) message = "Too many messages from your connection. Please try again later.";
        else if (res.status === 400) message = "We couldn't confirm you're not a robot. Please reload the page and try again.";
        else if (res.status === 422) {
          // The backend rejected the email itself; show its explanation, as the landing page does
          const body = await res.json().catch(() => null);
          if (typeof body?.detail === "string") message = body.detail;
          else if (typeof body?.message === "string") message = body.message;
        }
        status.textContent = message;
        return;
      }
      document.dispatchEvent(new CustomEvent("contact:submit", { detail: data }));
      lastSent = Date.now();
      try { localStorage.setItem(lastSentKey, String(lastSent)); } catch (_) {}
      thankYou();
    } catch (_) {
      // Network problem, reCAPTCHA blocked, or the backend refused this website (see NOTE above)
      status.textContent = "We couldn't send your message right now. Please try again in a moment.";
    } finally {
      setSending(false);
    }
  });
  form.addEventListener("input", e => {
    e.target.removeAttribute("aria-invalid");
    if (e.target.name === "message") e.target.setCustomValidity("");
  });
})();
