(() => {
  /* ---------- Tags band: chat bubbles behind the composer ----------
     Row offsets and order match the Figma "tags" frame (x = -441 relative to the 390px screen). */
  const TAG_ROWS = [
    { x: -441, y: 0, items: ["I’m looking for a reliable SUV under $40k", "Best cars under $25,000", "I want Apple CarPlay", "Best cars for a growing family", "Should I go electric?", "Show me good value cars", "AWD cars only", "I need good trunk space", "Is an EV worth it in Canada?", "Best EV for winter", "Looking for city car"] },
    { x: -441, y: 43, items: ["Does this car have heated seats?", "Best hybrid cars right now", "What can I afford with a $600/month payment?", "I want something fun but practical", "How much does it cost to charge an EV?", "What’s the best family car right now?", "Which cars have heads-up display?", "Easy to drive at night"] },
    { x: -351, y: 87, items: ["What’s the cheapest luxury car?", "I want something fuel efficient", "Compare gas vs electric", "How far can this EV actually go?", "Are hybrids reliable?", "What incentives are available?", "Cars with low maintenance costs", "EV or plug-in hybrid?", "I commute every day, what should I get?"] },
    { x: -441, y: 130, items: ["I want something quiet", "I need something good for winter driving", "I drive a lot for work", "Best cars with panoramic roof", "Compare BMW vs Audi", "I want a sporty feel, not boring", "Good car for city parking", "Which is better, RAV4 or CR-V?"] },
  ];

  const tagsEl = document.querySelector("[data-tags]");
  if (tagsEl) {
    tagsEl.innerHTML = TAG_ROWS.map(row => `
      <div class="tags__row" style="left:${row.x}px; top:${row.y}px">
        ${row.items.map(t => `
          <span class="bubble">
            <img class="bubble__tail" src="assets/bubble-tail.svg" alt="" />
            <span class="bubble__text">${t}</span>
          </span>`).join("")}
      </div>`).join("");
  }

  /* ---------- Composer ---------- */
  const form = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-input]");

  document.querySelectorAll("[data-fill]").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.fill;
      input.focus();
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

  /* ---------- Logo marquee: duplicate the row for a seamless loop ---------- */
  document.querySelectorAll("[data-marquee]").forEach(track => {
    const row = track.firstElementChild;
    const clone = row.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("img").forEach(img => (img.alt = ""));
    track.appendChild(clone);
  });

  /* ---------- Carousels ---------- */
  document.querySelectorAll("[data-carousel]").forEach(carousel => {
    const track = carousel.querySelector("[data-track]");
    const prev = carousel.querySelector("[data-prev]");
    const next = carousel.querySelector("[data-next]");
    const step = () => track.querySelector(".card").offsetWidth + 10;

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
     Only the second answer exists in the Figma file. Others need copy. */
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
})();
