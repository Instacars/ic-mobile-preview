/* Filter panel for the chat page (Figma 5988:4771).

   One set of filters, shared with Kaia:
   - Typing to Kaia ("red SUV under 30k") updates the filters; Kaia reports them after each search
     (a "filters" frame, re-sent by script.js as the "kaia:filters" event) and the panel shows them.
   - Applying the panel sends the whole set to Kaia ({ filter, metadata.source: "filter_panel" }); Kaia searches
     with exactly those, no guessing.
   - The chips above the composer show the active filters; × removes one, "Filters" opens the panel.
   - While editing, the button shows how many cars match (POST /filters/count, debounced).

   Filters use Kaia's own format (see kaia-backend services/filter_panel.py):
   price_range "lo-hi", year_range "lo-hi", miles_range "lo-hi" (in MILES; the panel shows km),
   car_type, transmission, and comma-separated body_type / fuel_type / drivetrain. Either end of a range may be empty. */
(() => {
  const chat = window.KaiaChat;
  if (!chat) return;

  const KM_PER_MILE = 1.609344;
  const PRICE_MAX = 100000, KM_MAX = 300000;
  const NEWEST = new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0); // model years run ahead from fall

  /* ---------- Panel sections ---------- */
  const icon = id => `<svg class="fpi"><use href="#fp-${id}"/></svg>`;
  const SECTIONS = [
    { key: "price_range", title: "Price", type: "range", max: PRICE_MAX, step: 1000, unit: "$" },
    {
      key: "year_range", title: "Year", type: "single", options: [
        { label: "Any", value: null },
        { label: "Before 2019", value: "-2018" },
        ...[2019, 2020, 2021, 2022, 2023, 2024, 2025].filter(y => y < NEWEST).map(y => ({ label: `${y}+`, value: `${y}-` })),
        { label: "Newest", value: `${NEWEST}-` },
      ],
    },
    { key: "miles_range", title: "Mileage", type: "range", max: KM_MAX, step: 5000, unit: "km" },
    {
      key: "car_type", title: "Condition", type: "single", options: [
        { label: "Used", value: "used", icon: "car-front" },
        { label: "New", value: "new", icon: "sparkles" },
        { label: "Certified Pre-owned", value: "certified", icon: "shield" },
      ],
    },
    {
      key: "body_type", title: "Body type", type: "multi", options:
        ["SUV", "Sedan", "Pickup", "Hatchback", "Minivan", "Coupe", "Convertible", "Wagon"].map(v => ({ label: v, value: v })),
    },
    {
      key: "transmission", title: "Transmission", type: "single", options: [
        { label: "Automatic", value: "Automatic", icon: "gear" },
        { label: "Manual", value: "Manual", icon: "wrench" },
      ],
    },
    {
      key: "fuel_type", title: "Fuel type", type: "multi", options: [
        { label: "Gas", value: "Gasoline", icon: "fuel", aliases: ["gas", "gasoline", "unleaded", "premium unleaded", "petrol"] },
        { label: "Diesel", value: "Diesel", icon: "gauge" },
        { label: "Hybrid", value: "Hybrid", icon: "battery", aliases: ["hybrid", "plug-in hybrid", "electric / unleaded", "unleaded / electric"] },
        { label: "Electric", value: "Electric", icon: "zap", aliases: ["electric", "ev"] },
      ],
    },
    {
      key: "drivetrain", title: "Drive type", type: "multi", options: [
        { label: "AWD (All Wheel Drive)", value: "AWD", short: "AWD" },
        { label: "4WD (Four Wheel Drive)", value: "4WD", short: "4WD", aliases: ["4wd", "4x4"] },
        { label: "FWD (Front Wheel Drive)", value: "FWD", short: "FWD" },
        { label: "RWD (Rear Wheel Drive)", value: "RWD", short: "RWD" },
      ],
    },
  ];
  const sectionFor = key => SECTIONS.find(s => s.key === key);
  const matches = (opt, raw) => {
    const v = String(raw).trim().toLowerCase();
    return v === String(opt.value).toLowerCase() || (opt.aliases || []).includes(v);
  };

  /* ---------- Reading and writing Kaia's filter format ---------- */
  const num = s => {
    const m = String(s).toLowerCase().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/);
    return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : null;
  };
  /* "0-30000", "-2018", "2019-", "under 30k", "over 20,000" -> { lo, hi } (null = open) */
  const parseRange = raw => {
    if (raw == null || raw === "") return { lo: null, hi: null };
    const s = String(raw).trim();
    const dash = s.match(/^\s*([\d,.]*k?)\s*-\s*([\d,.]*k?)\s*$/i);
    if (dash) return { lo: dash[1] ? num(dash[1]) : null, hi: dash[2] ? num(dash[2]) : null };
    const under = s.match(/(?:under|below|less than|max|up to)\s*\$?([\d,.]+k?)/i);
    if (under) return { lo: null, hi: num(under[1]) };
    const over = s.match(/(?:over|above|more than|at least|min)\s*\$?([\d,.]+k?)/i);
    if (over) return { lo: num(over[1]), hi: null };
    const one = num(s);
    return one != null ? { lo: null, hi: one } : { lo: null, hi: null };
  };
  const rangeValue = (lo, hi) => (lo == null && hi == null) ? null : `${lo ?? ""}-${hi ?? ""}`;
  const listOf = raw => raw ? String(raw).split(",").map(v => v.trim()).filter(Boolean) : [];
  const toKm = mi => mi == null ? null : Math.round(mi * KM_PER_MILE / 1000) * 1000;
  const toMiles = km => km == null ? null : Math.round(km / KM_PER_MILE);
  // Only real search filters (same list as the backend's FILTER_KEYS); internal values like _page or start are dropped
  const FILTER_KEYS = ["car_type", "price_range", "make", "exclude_make", "model", "year", "year_range", "miles_range",
    "transmission", "fuel_type", "drivetrain", "body_type", "doors", "exterior_color", "dealer_type", "seating_capacity"];
  const clean = f => Object.fromEntries(Object.entries(f || {}).filter(([k, v]) => FILTER_KEYS.includes(k) && v != null && v !== "" && v !== "None"));

  /* ---------- Labels for the chips and the summary sent to Kaia ---------- */
  const money = n => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  const kmText = n => `${n.toLocaleString("en-US")} km`;
  const title = s => String(s).replace(/\b\w/g, c => c.toUpperCase());
  const labelsFor = (key, value) => {
    if (key === "price_range") { const { lo, hi } = parseRange(value); return [lo && hi ? `${money(lo)}–${money(hi)}` : hi ? `Under ${money(hi)}` : lo ? `Over ${money(lo)}` : null]; }
    if (key === "miles_range") { const { lo, hi } = parseRange(value); const a = toKm(lo), b = toKm(hi); return [a && b ? `${kmText(a)}–${kmText(b)}` : b ? `Under ${kmText(b)}` : a ? `Over ${kmText(a)}` : null]; }
    if (key === "year_range") { const { lo, hi } = parseRange(value); return [lo && hi ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : lo ? `${lo}+` : hi ? `Before ${hi + 1}` : null]; }
    if (key === "year") return [String(value)];
    if (key === "doors") return [`${value} doors`];
    if (key === "seating_capacity") return [`${value} seats`];
    if (key === "exclude_make") return listOf(value).map(v => `No ${title(v)}`);
    if (key === "car_type") return [value === "certified" ? "Certified Pre-owned" : title(value)];
    const sec = sectionFor(key);
    if (sec && sec.options) {
      const seen = [];
      for (const v of listOf(value)) {
        const opt = sec.options.find(o => matches(o, v));
        const label = opt ? (opt.short || opt.label) : title(v);
        if (!seen.includes(label)) seen.push(label);
      }
      return seen;
    }
    return listOf(value).map(title);
  };
  const summary = f => {
    const parts = Object.entries(clean(f)).flatMap(([k, v]) => labelsFor(k, v)).filter(Boolean);
    return parts.length ? `Filters: ${parts.join(" · ")}` : "Clear all filters";
  };

  /* ---------- State ---------- */
  let current = {};   // what Kaia is searching with (last reported, or last applied)
  let draft = {};     // what the open panel shows

  const panel = document.querySelector("[data-fpanel]");
  const box = panel.querySelector(".fpanel__box");
  const body = panel.querySelector("[data-fpanel-body]");
  const applyBtn = panel.querySelector("[data-fpanel-apply]");
  const chipsBar = document.querySelector("[data-fchips]");
  const badge = document.querySelector("[data-fbadge]");
  const opener = document.querySelector("[data-fpanel-open]");
  let lastFocus = null;

  /* ---------- Building the panel ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const token = (sec, opt, on) => `<button type="button" class="ftoken${on ? " is-on" : ""}" aria-pressed="${on}" data-key="${sec.key}" data-value="${esc(opt.value ?? "")}">${opt.icon ? icon(opt.icon) : ""}<span>${esc(opt.label)}</span></button>`;

  const sectionHtml = sec => {
    const raw = draft[sec.key];
    if (sec.type === "range") {
      const r = parseRange(raw);
      let lo = r.lo, hi = r.hi;
      if (sec.unit === "km") { lo = toKm(lo); hi = toKm(hi); }
      const loV = lo ?? 0, hiV = hi ?? sec.max;
      const id = `fr-${sec.key}`;
      return `<section class="fsec" data-range="${sec.key}">
        <h3 class="fsec__title">${sec.title}</h3>
        <div class="frange" style="--lo:${(loV / sec.max) * 100}%;--hi:${(Math.min(hiV, sec.max) / sec.max) * 100}%">
          <input type="range" min="0" max="${sec.max}" step="${sec.step}" value="${loV}" aria-label="${sec.title} minimum" data-end="lo" />
          <input type="range" min="0" max="${sec.max}" step="${sec.step}" value="${Math.min(hiV, sec.max)}" aria-label="${sec.title} maximum" data-end="hi" />
        </div>
        <div class="frange__fields">
          <label class="ffield"><span>Minimum</span><input id="${id}-lo" inputmode="numeric" placeholder="${sec.unit === "$" ? "$0" : "0 km"}" value="${lo ? lo.toLocaleString("en-US") : ""}" data-end="lo" /></label>
          <span class="frange__to">To</span>
          <label class="ffield"><span>Maximum</span><input id="${id}-hi" inputmode="numeric" placeholder="${sec.unit === "$" ? `$${sec.max / 1000}k+` : `${sec.max / 1000}k+ km`}" value="${hi ? hi.toLocaleString("en-US") : ""}" data-end="hi" /></label>
        </div>
      </section>`;
    }
    const values = listOf(raw);
    const isOn = opt => opt.value == null ? (sec.key === "year_range" ? !draft.year_range && !draft.year : !values.length) : values.some(v => matches(opt, v));
    return `<section class="fsec"><h3 class="fsec__title">${sec.title}</h3><div class="ftokens">${sec.options.map(o => token(sec, o, isOn(o))).join("")}</div></section>`;
  };
  const render = () => { body.innerHTML = SECTIONS.map(sectionHtml).join('<hr class="fsec__line" />'); };

  /* ---------- Editing ---------- */
  body.addEventListener("click", e => {
    const b = e.target.closest(".ftoken");
    if (!b) return;
    const sec = sectionFor(b.dataset.key);
    const opt = sec.options.find(o => String(o.value ?? "") === b.dataset.value);
    if (sec.type === "single") {
      const on = b.classList.contains("is-on") && opt.value != null;
      draft[sec.key] = on ? null : opt.value; // tapping the chosen one again clears it
      if (sec.key === "year_range") draft.year = null;
    } else {
      const values = listOf(draft[sec.key]).filter(v => !matches(opt, v));
      if (!b.classList.contains("is-on")) values.push(opt.value);
      draft[sec.key] = values.length ? values.join(",") : null;
    }
    const keep = body.scrollTop;
    render(); body.scrollTop = keep;
    body.querySelector(`.ftoken[data-key="${sec.key}"][data-value="${CSS.escape(b.dataset.value)}"]`)?.focus();
    recount();
  });

  const setRange = (secEl, lo, hi, from) => {
    const sec = sectionFor(secEl.dataset.range);
    if (lo != null && hi != null && lo > hi) { if (from === "lo") hi = lo; else lo = hi; }
    const openLo = !lo ? null : lo, openHi = hi == null || hi >= sec.max ? null : hi;
    draft[sec.key] = sec.unit === "km" ? rangeValue(toMiles(openLo), toMiles(openHi)) : rangeValue(openLo, openHi);
    const [rLo, rHi] = secEl.querySelectorAll('input[type="range"]');
    rLo.value = lo ?? 0; rHi.value = Math.min(hi ?? sec.max, sec.max);
    secEl.querySelector(".frange").style.setProperty("--lo", `${(rLo.value / sec.max) * 100}%`);
    secEl.querySelector(".frange").style.setProperty("--hi", `${(rHi.value / sec.max) * 100}%`);
    const [fLo, fHi] = secEl.querySelectorAll(".ffield input");
    if (from !== "field-lo") fLo.value = openLo ? openLo.toLocaleString("en-US") : "";
    if (from !== "field-hi") fHi.value = openHi ? openHi.toLocaleString("en-US") : "";
    recount();
  };
  body.addEventListener("input", e => {
    const secEl = e.target.closest("[data-range]");
    if (!secEl) return;
    const [rLo, rHi] = secEl.querySelectorAll('input[type="range"]');
    if (e.target.type === "range") {
      setRange(secEl, Number(rLo.value), Number(rHi.value), e.target.dataset.end);
    } else {
      const sec = sectionFor(secEl.dataset.range);
      const [fLo, fHi] = secEl.querySelectorAll(".ffield input");
      const lo = num(fLo.value), hi = num(fHi.value);
      setRange(secEl, lo, hi ?? sec.max, `field-${e.target.dataset.end}`);
    }
  });
  body.addEventListener("change", e => { // tidy typed numbers once the shopper leaves the field
    const f = e.target.closest(".ffield input");
    if (f && num(f.value) != null) f.value = num(f.value).toLocaleString("en-US");
  });

  /* ---------- Live count on the button ---------- */
  let countTimer = null, countAbort = null;
  const setButton = (n, loading) => {
    applyBtn.disabled = n === 0;
    applyBtn.classList.toggle("is-loading", !!loading);
    applyBtn.textContent = n == null ? "Show cars" : n === 0 ? "No cars match" : `Show ${n.toLocaleString("en-US")} car${n === 1 ? "" : "s"}`;
  };
  const recount = () => {
    if (!chat.api) return;
    clearTimeout(countTimer);
    applyBtn.classList.add("is-loading");
    countTimer = setTimeout(async () => {
      if (countAbort) countAbort.abort();
      countAbort = new AbortController();
      try {
        const r = await fetch(`${chat.api}/filters/count`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: clean(draft) }), signal: countAbort.signal,
        });
        if (!r.ok) throw new Error(r.status);
        setButton((await r.json()).num_found);
      } catch (err) { if (err.name !== "AbortError") setButton(null); }
    }, 350);
  };

  /* ---------- Applying (panel or chip) ---------- */
  const apply = (filters) => {
    const next = clean(filters);
    const text = summary(next);
    const go = () => { current = next; showChips(); chat.send(text, { source: "filter_panel" }, { filter: next }); };
    if (!chat.isWaiting()) return go();
    // Kaia is still answering: send as soon as she's done (up to 30 s)
    const t0 = Date.now();
    const wait = setInterval(() => { if (!chat.isWaiting()) { clearInterval(wait); go(); } else if (Date.now() - t0 > 30000) clearInterval(wait); }, 300);
  };

  /* ---------- Active-filter chips above the composer ---------- */
  // The dock changes height with the chips: refit the conversation's bottom padding (script.js listens to
  // resize) and stay at the latest message if the shopper was already there.
  const keepBottom = () => {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    window.dispatchEvent(new Event("resize"));
    if (atBottom) window.scrollTo(0, document.documentElement.scrollHeight);
  };
  const showChips = () => {
    const entries = Object.entries(clean(current));
    const count = entries.length;
    badge.hidden = !count; badge.textContent = count;
    opener.setAttribute("aria-label", count ? `Filters (${count} active)` : "Filters");
    chipsBar.hidden = !count;
    if (!count) { chipsBar.innerHTML = ""; keepBottom(); return; }
    chipsBar.innerHTML = `<button type="button" class="fchip fchip--edit" data-fchip-edit><img src="assets/sliders.svg" width="14" height="14" alt="" />Filters</button>` +
      entries.map(([k, v]) => {
        const text = labelsFor(k, v).filter(Boolean).join(", ");
        return `<span class="fchip">${esc(text)}<button type="button" class="fchip__x" aria-label="Remove ${esc(text)}" data-fchip-remove="${k}"><svg class="fpi"><use href="#fp-x"/></svg></button></span>`;
      }).join("");
    keepBottom();
  };
  chipsBar.addEventListener("click", e => {
    if (e.target.closest("[data-fchip-edit]")) return open();
    const x = e.target.closest("[data-fchip-remove]");
    if (!x) return;
    const next = { ...current, [x.dataset.fchipRemove]: null };
    if (x.dataset.fchipRemove === "year_range") next.year = null;
    apply(next);
  });

  /* ---------- Open / close ---------- */
  const open = () => {
    lastFocus = document.activeElement;
    draft = { ...current };
    render();
    setButton(null); recount();
    panel.hidden = false;
    document.documentElement.classList.add("fpanel-open");
    body.scrollTop = 0;
    panel.querySelector(".fpanel__close").focus();
  };
  const close = () => {
    panel.hidden = true;
    document.documentElement.classList.remove("fpanel-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  opener.addEventListener("click", open);
  panel.querySelectorAll("[data-fpanel-close]").forEach(b => b.addEventListener("click", close));
  panel.querySelector("[data-fpanel-clear]").addEventListener("click", () => { draft = {}; render(); recount(); });
  applyBtn.addEventListener("click", () => {
    const changed = JSON.stringify(clean(draft)) !== JSON.stringify(clean(current));
    close();
    if (changed) apply(draft);
  });
  document.addEventListener("keydown", e => {
    if (panel.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") { // keep focus inside the open panel
      const items = [...box.querySelectorAll("button:not([disabled]), input")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Kaia reports the filters she's now using ---------- */
  document.addEventListener("kaia:filters", e => {
    current = clean(e.detail.filters);
    showChips();
    if (!panel.hidden) return; // don't overwrite what the shopper is editing
  });
})();
