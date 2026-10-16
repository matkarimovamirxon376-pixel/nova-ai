// Conversation history + settings persistence using localStorage.
// Everything stays in the browser; nothing about the user is sent anywhere
// except the prompt text when an AI provider is connected.

const CONV_KEY = 'nova.conversations.v1';
const SETTINGS_KEY = 'nova.settings.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled — ignore */
  }
}

export const store = {
  getConversations() {
    return read(CONV_KEY, []);
  },
  saveConversations(list) {
    write(CONV_KEY, list);
  },
  getSettings() {
    // ocr: client-side OCR (downloads Tesseract.js on first use) — opt-in.
    return read(SETTINGS_KEY, { theme: 'dark', tts: false, voice: '', ocr: false });
  },
  saveSettings(s) {
    write(SETTINGS_KEY, s);
  },
  clearConversations() {
    write(CONV_KEY, []);
  },
};

export function newId() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
