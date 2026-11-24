(() => {
  /* ---------- Billing toggle ----------
     Annual = "2 months free": 10 × the monthly price, billed yearly.
     Prices live in each element's data-monthly / data-annual attributes. */
  const options = document.querySelectorAll("[data-billing]");
  const priced = document.querySelectorAll("[data-monthly]");
  const setBilling = period => {
    options.forEach(opt => {
      const on = opt.dataset.billing === period;
      opt.classList.toggle("is-selected", on);
      opt.setAttribute("aria-checked", String(on));
    });
    priced.forEach(el => { el.textContent = el.dataset[period]; });
  };
  options.forEach(opt => opt.addEventListener("click", () => setBilling(opt.dataset.billing)));
  // Arrow keys move between the two options, as in a radio group.
  document.querySelector(".billing").addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = [...options].find(o => !o.classList.contains("is-selected"));
    setBilling(next.dataset.billing);
    next.focus();
  });

  /* ---------- Contact form ----------
     No backend yet: validates, then shows a confirmation. Hook point: dispatches "kaia:lead". */
  const form = document.querySelector("[data-contact]");
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

  /* ---------- FAQ accordion ----------
     Only the second answer exists in the design (it ends mid-sentence there too). */
  const FAQ = [
    { q: "Does instacars charge any fees?", a: null },
    { q: "How does Instacars work?", a: "Instacars is Canada’s best online search platform to find new and used cars in your area. We work directly with car dealers to get you the best possible rates. Once you find a car you like, just", open: true },
    { q: "There are soo many used cars listed here. How is this any better?", a: null },
    { q: "What are the popular car models in the market right now?", a: null },
    { q: "How are Instacars prices so great?", a: null },
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
