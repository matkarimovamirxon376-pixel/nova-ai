// Voice input (Web Speech API — SpeechRecognition) and
// text-to-speech (SpeechSynthesis). Both are browser-native and free.
// Everything degrades gracefully when the browser lacks support.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speech = {
  recognitionSupported: Boolean(SR),
  ttsSupported: 'speechSynthesis' in window,
  _recognition: null,

  /**
   * Start listening. Calls onResult(text) with the transcript, onEnd() when
   * finished (or on error). Returns true if listening actually started.
   */
  listen({ lang = 'uz-UZ', onResult, onEnd, onError } = {}) {
    if (!SR) {
      onError && onError('unsupported');
      return false;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      onResult && onResult(text);
    };
    rec.onerror = (e) => onError && onError(e.error || 'error');
    rec.onend = () => {
      this._recognition = null;
      onEnd && onEnd();
    };
    this._recognition = rec;
    try {
      rec.start();
      return true;
    } catch {
      this._recognition = null;
      return false;
    }
  },

  stopListening() {
    if (this._recognition) {
      try { this._recognition.stop(); } catch { /* ignore */ }
      this._recognition = null;
    }
  },

  getVoices() {
    if (!this.ttsSupported) return [];
    return window.speechSynthesis.getVoices();
  },

  speak(text, { voiceName = '', lang = 'uz-UZ' } = {}) {
    if (!this.ttsSupported || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = this.getVoices();
    const chosen =
      voices.find((v) => v.name === voiceName) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ||
      null;
    if (chosen) {
      u.voice = chosen;
      u.lang = chosen.lang;
    } else {
      u.lang = lang;
    }
    window.speechSynthesis.speak(u);
  },

  stopSpeaking() {
    if (this.ttsSupported) window.speechSynthesis.cancel();
  },
};
