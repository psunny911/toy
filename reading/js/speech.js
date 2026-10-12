// 음성 인식(Web Speech API)·읽어 주기(speechSynthesis) 래퍼. DOM 없이 브라우저 API만 쓴다.
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const MAX_LISTEN_MS = 15000;

  /**
   * 한 번 듣기. 말이 끝나면 브라우저가 알아서 멈추고 onEnd가 불린다.
   * @param {{ onInterim?: (text:string)=>void, onEnd: (r:{candidates:string[], error:string|null})=>void }} handlers
   * @returns {{ stop: () => void, abort: () => void }}
   */
  function listen(handlers) {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;

    let candidates = [];
    let error = null;
    let ended = false;
    const watchdog = setTimeout(() => stop(), MAX_LISTEN_MS);

    rec.onresult = (e) => {
      const results = Array.from(e.results);
      const alts = Math.max(1, ...results.map((r) => r.length));
      // 후보 k = 각 구간의 k번째 대안을 이어 붙인 것 (대안이 모자라면 1순위로 채움)
      candidates = [];
      for (let k = 0; k < alts; k++) {
        candidates.push(results.map((r) => r[Math.min(k, r.length - 1)].transcript).join(' ').replace(/\s+/g, ' ').trim());
      }
      if (handlers.onInterim) handlers.onInterim(candidates[0], candidates);
    };
    rec.onerror = (e) => { error = e.error || 'error'; };
    rec.onend = finish;

    function finish() {
      if (ended) return;
      ended = true;
      clearTimeout(watchdog);
      handlers.onEnd({ candidates: candidates.filter(Boolean), error: candidates.length ? null : error });
    }

    function stop() {
      try { rec.stop(); } catch (e) { finish(); }
      // 일부 브라우저(iOS)는 stop 뒤 onend가 늦거나 오지 않는다
      setTimeout(finish, 1500);
    }

    try {
      rec.start();
    } catch (e) {
      error = 'start-failed';
      setTimeout(finish, 0);
    }

    return {
      stop,
      abort() {
        ended = true;
        clearTimeout(watchdog);
        try { rec.abort(); } catch (e) { /* 이미 끝남 */ }
      },
    };
  }

  let voice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    voice = voices.find((v) => /en[-_]US/i.test(v.lang) && v.localService)
      || voices.find((v) => /en[-_]US/i.test(v.lang)) || voices[0] || null;
    return voice;
  }
  if (window.speechSynthesis) {
    pickVoice();
    if ('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = pickVoice;
  }

  /** 문장 읽어 주기 */
  function speak(text, onDone) {
    if (!window.speechSynthesis) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    if (voice || pickVoice()) u.voice = voice;
    if (onDone) { u.onend = onDone; u.onerror = onDone; }
    speechSynthesis.speak(u);
    return true;
  }

  function cancelSpeak() {
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  window.Speech = {
    supported: !!Recognition,
    canSpeak: !!window.speechSynthesis,
    listen,
    speak,
    cancelSpeak,
  };
})();
