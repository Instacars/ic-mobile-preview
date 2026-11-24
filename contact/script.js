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

  const showTab = (name, { focus = false, updateUrl = false } = {}) => {
    if (!names.includes(name)) name = "general";
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panels.forEach(p => { p.hidden = p.dataset.panel !== name; });
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
  const fromHash = () => showTab(location.hash.slice(1));
  window.addEventListener("hashchange", fromHash);
  fromHash();

  /* ---------- General form ----------
     No backend yet: checks the required fields, then thanks the visitor.
     Hook point: dispatches "contact:submit" with { name, email, company, message } on document. */
  const form = document.querySelector("[data-contact-form]");
  const status = form.querySelector("[data-form-status]");
  form.addEventListener("submit", e => {
    e.preventDefault();
    let firstBad = null;
    form.querySelectorAll("input, textarea").forEach(field => {
      const bad = !field.checkValidity();
      field.setAttribute("aria-invalid", String(bad));
      if (bad && !firstBad) firstBad = field;
    });
    if (firstBad) {
      status.textContent = "Please add your name, a valid email and a message.";
      firstBad.focus();
      return;
    }
    document.dispatchEvent(new CustomEvent("contact:submit", { detail: Object.fromEntries(new FormData(form)) }));
    status.textContent = "Thanks! We'll get back to you soon.";
    form.reset();
  });
  form.addEventListener("input", e => e.target.removeAttribute("aria-invalid"));
})();
