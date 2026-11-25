/* Voice input for Instacars search boxes: tap the mic, speak, and the words appear in the box.
   Shared by the marketplace homepage and the chat page (published at the site root as voice-input.js).

   Uses the browser's own speech recognition: Chrome, Edge and Safari support it; Firefox doesn't, so
   there the mic explains instead. Words appear as you speak; it stops by itself after a pause, on a
   second tap, or with Escape. The text stays in the box for the visitor to check and send.
   Chrome and Edge send the audio to their own speech service (Google / Microsoft) to turn it into
   text; Safari uses Apple's.

   Usage:
     KaiaVoice.attach({ mic, input, status, onChange })
       mic      the mic <button>
       input    the <textarea>/<input> to fill
       status   an element with role="status" for short messages (hidden when empty)
       onChange called after the text changes (e.g. to enable the send button or resize the box)
*/
(() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const MESSAGES = {
    unsupported: "Voice input isn't available in this browser. Try Chrome, Edge or Safari, or type instead.",
    "not-allowed": "Microphone access is blocked. Allow the microphone for this site in your browser, then try again.",
    "service-not-allowed": "Voice input is turned off in this browser.",
    "audio-capture": "No microphone found. Check that one is connected.",
    "no-speech": "Didn't catch that. Tap the mic and try again.",
    network: "Voice input needs an internet connection.",
    "language-not-supported": "Voice input isn't available for your language in this browser.",
    other: "Voice input stopped. Tap the mic to try again.",
  };

  function attach({ mic, input, status, onChange = () => {} }) {
    if (!mic || !input) return;
    const placeholder = input.placeholder;
    let recognition = null;
    let timer = null;

    const say = (text, ms = 4000) => {
      if (!status) return;
      clearTimeout(timer);
      status.textContent = text;
      status.hidden = !text;
      if (text && ms) timer = setTimeout(() => { status.hidden = true; status.textContent = ""; }, ms);
    };
    const setListening = on => {
      mic.classList.toggle("is-listening", on);
      mic.setAttribute("aria-pressed", String(on));
      mic.setAttribute("aria-label", on ? "Stop listening" : "Speak instead of typing");
      input.placeholder = on ? "Listening… speak now" : placeholder;
    };

    mic.addEventListener("click", () => {
      if (recognition) { recognition.stop(); return; } // second tap: stop and keep what was heard
      if (!Recognition) { say(MESSAGES.unsupported, 6000); return; }
      const before = input.value.trim();
      const prefix = before ? before + " " : "";
      recognition = new Recognition();
      recognition.lang = navigator.language || "en-CA"; // the visitor's browser language (e.g. fr-CA for French)
      recognition.interimResults = true; // show words while they're still speaking
      recognition.continuous = false;    // stop after a pause
      recognition.maxAlternatives = 1;

      recognition.onstart = () => { setListening(true); say("", 0); };
      recognition.onresult = e => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        input.value = prefix + text.trimStart();
        onChange();
      };
      recognition.onerror = e => { if (e.error !== "aborted") say(MESSAGES[e.error] || MESSAGES.other); };
      recognition.onend = () => {
        recognition = null;
        setListening(false);
        input.value = input.value.replace(/\s+$/, "");
        onChange();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };
      try { recognition.start(); } catch (err) { recognition = null; setListening(false); say(MESSAGES.other); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && recognition) recognition.stop(); });
  }

  window.KaiaVoice = { attach, supported: !!Recognition };
})();
