// NOVA AI — main application controller.
// Wires together UI, i18n, storage, speech, file handling and the API client.

import { uz, applyI18n } from './i18n.js';
import { store, newId } from './storage.js';
import { speech } from './speech.js';
import { processFile, extractPdf, isImage } from './files.js';
import { chooseStrategy, ocrPdf, visionPdf } from './ocr.js';
import * as api from './api.js';

// ---- Element refs ---------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const el = {
  sidebar: $('#sidebar'),
  backdrop: $('#sidebarBackdrop'),
  menuBtn: $('#menuBtn'),
  newChatBtn: $('#newChatBtn'),
  tools: document.querySelectorAll('.tool[data-task]'),
  historyList: $('#historyList'),
  settingsBtn: $('#settingsBtn'),
  chat: $('#chat'),
  welcome: $('#welcome'),
  suggestions: $('#suggestions'),
  input: $('#input'),
  sendBtn: $('#sendBtn'),
  micBtn: $('#micBtn'),
  attachBtn: $('#attachBtn'),
  fileInput: $('#fileInput'),
  attachments: $('#attachments'),
  activeToolTitle: $('#activeToolTitle'),
  statusDot: $('#statusDot'),
  statusText: $('#statusText'),
  themeBtn: $('#themeBtn'),
  settingsDialog: $('#settingsDialog'),
  themeSegment: $('#themeSegment'),
  ttsToggle: $('#ttsToggle'),
  ocrToggle: $('#ocrToggle'),
  ocrHint: $('#ocrHint'),
  voiceSelect: $('#voiceSelect'),
  aboutText: $('#aboutText'),
  clearDataBtn: $('#clearDataBtn'),
  toast: $('#toast'),
};

// ---- State ----------------------------------------------------------------
const state = {
  task: 'chat',
  conversations: store.getConversations(),
  currentId: null,
  settings: store.getSettings(),
  pendingAttachments: [],
  aiConnected: false,
  busy: false,
};

// ---- Helpers --------------------------------------------------------------
function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.toast.hidden = true), ms);
}

function currentConv() {
  return state.conversations.find((c) => c.id === state.currentId) || null;
}

function persist() {
  store.saveConversations(state.conversations);
}

// ---- Theme ----------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  state.settings.theme = theme;
  store.saveSettings(state.settings);
  el.themeSegment.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeVal === theme);
  });
}

// ---- Rendering ------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function ensureChatInner() {
  let inner = el.chat.querySelector('.chat__inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'chat__inner';
    el.chat.appendChild(inner);
  }
  return inner;
}

function renderMessages() {
  const conv = currentConv();
  el.chat.innerHTML = '';
  if (!conv || conv.messages.length === 0) {
    el.chat.appendChild(el.welcome);
    el.welcome.hidden = false;
    renderSuggestions();
    return;
  }
  el.welcome.hidden = true;
  const inner = ensureChatInner();
  for (const m of conv.messages) inner.appendChild(messageNode(m));
  scrollToBottom();
}

function messageNode(m) {
  const node = document.createElement('div');
  node.className = `msg msg--${m.role === 'user' ? 'user' : 'ai'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg__avatar';
  avatar.textContent = m.role === 'user' ? '🧑' : '✦';

  const body = document.createElement('div');
  body.className = 'msg__body';

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (m.notice ? ' notice' : '');
  bubble.innerHTML = formatContent(m);
  body.appendChild(bubble);

  if (m.role === 'ai' && !m.notice && !m.pending) {
    const actions = document.createElement('div');
    actions.className = 'msg__actions';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 ' + uz.copy;
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(m.content);
      toast(uz.copied);
    };
    actions.appendChild(copyBtn);
    if (speech.ttsSupported) {
      const speakBtn = document.createElement('button');
      speakBtn.textContent = '🔊 ' + uz.speak;
      speakBtn.onclick = () => speech.speak(m.content, { voiceName: state.settings.voice });
      actions.appendChild(speakBtn);
    }
    body.appendChild(actions);
  }

  node.appendChild(avatar);
  node.appendChild(body);
  return node;
}

function formatContent(m) {
  if (m.pending) {
    return '<span class="typing"><span></span><span></span><span></span></span>';
  }
  let html = escapeHtml(m.content || '');
  // Light markdown: **bold** and `code`.
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  if (m.attachments && m.attachments.length) {
    const atts = m.attachments
      .map((a) =>
        a.kind === 'image' && a.dataUrl
          ? `<div class="attachment"><img src="${a.dataUrl}" alt=""><span class="name">${escapeHtml(a.name)}</span></div>`
          : `<div class="attachment"><span>📄</span><span class="name">${escapeHtml(a.name)}</span></div>`
      )
      .join('');
    html = `<div class="composer__attachments" style="margin:0 0 8px">${atts}</div>` + html;
  }
  return html;
}

function scrollToBottom() {
  requestAnimationFrame(() => { el.chat.scrollTop = el.chat.scrollHeight; });
}

function renderSuggestions() {
  const items = uz.suggestions[state.task] || uz.suggestions.chat;
  el.suggestions.innerHTML = '';
  for (const s of items) {
    const b = document.createElement('button');
    b.className = 'suggestion';
    b.innerHTML = `<strong>${escapeHtml(s.t)}</strong>${escapeHtml(s.d)}`;
    b.onclick = () => {
      el.input.value = s.d;
      autoGrow();
      el.input.focus();
    };
    el.suggestions.appendChild(b);
  }
}

function renderHistory() {
  el.historyList.innerHTML = '';
  if (state.conversations.length === 0) {
    const li = document.createElement('li');
    li.className = 'history__item';
    li.style.cursor = 'default';
    li.innerHTML = `<span style="color:var(--text-mute)">${uz.empty_history}</span>`;
    el.historyList.appendChild(li);
    return;
  }
  for (const c of state.conversations) {
    const li = document.createElement('li');
    li.className = 'history__item' + (c.id === state.currentId ? ' active' : '');
    li.innerHTML = `<span>${escapeHtml(c.title || uz.newChat)}</span>`;
    li.onclick = () => { state.currentId = c.id; renderMessages(); renderHistory(); closeSidebar(); };
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '🗑';
    del.onclick = (ev) => {
      ev.stopPropagation();
      state.conversations = state.conversations.filter((x) => x.id !== c.id);
      if (state.currentId === c.id) state.currentId = null;
      persist();
      renderHistory();
      renderMessages();
    };
    li.appendChild(del);
    el.historyList.appendChild(li);
  }
}

// ---- Conversation flow ----------------------------------------------------
function newConversation() {
  state.currentId = null;
  state.pendingAttachments = [];
  renderAttachments();
  renderMessages();
  renderHistory();
  el.input.focus();
}

function startConversationIfNeeded(firstText) {
  if (currentConv()) return currentConv();
  const conv = {
    id: newId(),
    title: (firstText || uz.toolTitles[state.task]).slice(0, 40),
    task: state.task,
    messages: [],
    createdAt: Date.now(),
  };
  state.conversations.unshift(conv);
  state.currentId = conv.id;
  return conv;
}

async function send() {
  if (state.busy) return;
  const text = el.input.value.trim();
  const atts = state.pendingAttachments.slice();
  if (!text && atts.length === 0) return;

  // Guard: don't send while a PDF is still being extracted.
  if (atts.some((a) => a.status === 'processing')) {
    toast(uz.pdf_still_processing);
    return;
  }

  const conv = startConversationIfNeeded(text || atts[0]?.name);

  // Build the prompt including any text-file / PDF contents and image notes.
  let prompt = text;
  const imageAtt = atts.find((a) => a.kind === 'image');
  for (const a of atts) {
    if (a.kind === 'text') {
      prompt += `\n\n[Hujjat: ${a.name}]\n${a.text}`;
    } else if (a.kind === 'pdf') {
      if (a.status === 'error') {
        prompt += `\n\n[PDF: ${a.name} — matn ajratib bolmadi]`;
      } else if (a.extractable && a.text) {
        const src = a.ocrEngine === 'tesseract' ? ' (OCR)'
          : a.ocrEngine === 'vision' ? ' (vision)' : '';
        prompt += `\n\n[PDF hujjat: ${a.name}${src}]\n${a.text}`;
      } else if (a.scanned) {
        // Honest note: scanned PDF with no usable text (OCR/vision off/failed).
        prompt += `\n\n[PDF: ${a.name} — skaner qilingan, matn ajratib bolmadi]`;
      } else {
        prompt += `\n\n[PDF: ${a.name} — ${a.warning || 'matn topilmadi'}]`;
      }
    } else if (a.kind === 'image') {
      prompt += `\n\n[Rasm biriktirildi: ${a.name}]`;
    } else {
      prompt += `\n\n[Fayl biriktirildi: ${a.name} — matn sifatida oqib bolmadi]`;
    }
  }

  conv.messages.push({ role: 'user', content: text || '(fayl)', attachments: atts });
  el.input.value = '';
  state.pendingAttachments = [];
  renderAttachments();
  autoGrow();
  renderMessages();
  renderHistory();
  persist();

  // Pending AI bubble
  const pending = { role: 'ai', content: '', pending: true };
  conv.messages.push(pending);
  renderMessages();

  state.busy = true;
  el.sendBtn.disabled = true;

  const history = conv.messages
    .filter((m) => !m.pending && m.content)
    .slice(0, -1)
    .slice(-10)
    .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

  // Decide whether this is a vision request: image tool OR an image attached
  // while on a non-document task. Vision needs the backend /api/vision path.
  const useVision = imageAtt && (state.task === 'image' || state.task === 'chat');

  try {
    let reply;
    if (useVision) {
      const r = await api.vision({ prompt: prompt || '', dataUrl: imageAtt.dataUrl });
      reply = r.text;
    } else {
      const r = await api.generate({ task: state.task, prompt, history });
      reply = r.text;
    }
    pending.pending = false;
    pending.content = reply || uz.error_generic;
    if (state.settings.tts && speech.ttsSupported) {
      speech.speak(pending.content, { voiceName: state.settings.voice });
    }
  } catch (e) {
    pending.pending = false;
    if (e.code === 'AI_NOT_CONNECTED') {
      pending.notice = true;
      pending.content =
        `⚠️ ${uz.ai_not_connected_title}\n\n` +
        (e.message ||
          'AI xizmati hali ulanmagan. Haqiqiy javoblar uchun server tomonida AI provayderni sozlang (README).');
    } else if (e.code === 'VISION_NOT_AVAILABLE') {
      pending.notice = true;
      pending.content =
        `⚠️ ${uz.vision_not_available_title}\n\n` +
        (e.message ||
          'Joriy provayderda rasm tahlili mavjud emas. Vision modelni sozlang (README).');
    } else {
      pending.content = `${uz.error_generic}\n(${escapeHtml(e.message || e.code || '')})`;
    }
  } finally {
    state.busy = false;
    el.sendBtn.disabled = false;
    // keep title in sync with first user message
    const firstUser = conv.messages.find((m) => m.role === 'user');
    if (firstUser) conv.title = (firstUser.content || uz.newChat).slice(0, 40);
    persist();
    renderMessages();
    renderHistory();
  }
}

// ---- Attachments UI -------------------------------------------------------
function renderAttachments() {
  if (state.pendingAttachments.length === 0) {
    el.attachments.hidden = true;
    el.attachments.innerHTML = '';
    return;
  }
  el.attachments.hidden = false;
  el.attachments.innerHTML = '';
  state.pendingAttachments.forEach((a, i) => {
    const div = document.createElement('div');
    div.className = 'attachment';

    let icon;
    if (a.kind === 'image' && a.dataUrl) icon = `<img src="${a.dataUrl}" alt="">`;
    else if (a.kind === 'pdf') icon = '<span>📕</span>';
    else icon = '<span>📄</span>';

    // Status badge: processing / progress / warning / error / success.
    let badge = '';
    if (a.status === 'processing') {
      const label = a.progress ? a.progress : uz.pdf_extracting;
      badge = `<span class="att-badge att-badge--proc">${escapeHtml(label)}</span>`;
    } else if (a.status === 'error') {
      badge = `<span class="att-badge att-badge--err">⚠️ ${escapeHtml(uz.pdf_error)}</span>`;
    } else if (a.kind === 'pdf' && a.status === 'ready') {
      if (a.extractable) {
        const via =
          a.ocrEngine === 'tesseract' ? ' · OCR' : a.ocrEngine === 'vision' ? ' · vision' : '';
        badge = `<span class="att-badge att-badge--ok">✓ ${a.chars} ${escapeHtml(uz.chars)}${via}</span>`;
      } else if (a.ocrStatus === 'assets_failed') {
        badge = `<span class="att-badge att-badge--err">⚠️ OCR</span>`;
      } else if (a.ocrStatus === 'vision_unavailable' || a.ocrStatus === 'unavailable') {
        badge = `<span class="att-badge att-badge--warn">⚠️ ${escapeHtml(uz.pdf_scanned)}</span>`;
      } else {
        badge = `<span class="att-badge att-badge--warn">⚠️ ${escapeHtml(uz.pdf_no_text)}</span>`;
      }
    }

    div.innerHTML =
      icon +
      `<span class="att-info"><span class="name">${escapeHtml(a.name)}</span>${badge}</span>`;

    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '✕';
    rm.onclick = () => {
      state.pendingAttachments.splice(i, 1);
      renderAttachments();
    };
    div.appendChild(rm);
    el.attachments.appendChild(div);
  });
}

async function handleFiles(fileList) {
  for (const file of fileList) {
    try {
      const att = await processFile(file);
      state.pendingAttachments.push(att);
      renderAttachments();
      toast(`${file.name} ${uz.attached}`);

      // PDFs are extracted on the backend; update the badge when done.
      if (att.kind === 'pdf' && att.status === 'processing') {
        await extractPdf(att);
        renderAttachments();
        if (att.status === 'error') {
          toast(uz.pdf_error);
        } else if (!att.extractable) {
          // Scanned / image-based PDF: try OCR or vision fallback.
          await handleScannedPdf(att);
        }
      }
    } catch (e) {
      if (e.message === 'TOO_BIG') toast(uz.file_too_big);
      else toast(uz.error_generic);
    }
  }
  renderAttachments();
}

// Handle a scanned (non-extractable) PDF: choose OCR or vision, run it with
// live progress, and fill the attachment's text. Honest about every outcome.
async function handleScannedPdf(att) {
  const strategy = chooseStrategy({
    extractable: false,
    visionAvailable: Boolean(state.visionAvailable),
    ocrEnabled: Boolean(state.settings.ocr),
  });

  att.scanned = true;

  if (strategy === 'unavailable') {
    // Nothing we can do without OCR or a vision provider — stay honest.
    att.ocrStatus = 'unavailable';
    att.progress = '';
    renderAttachments();
    toast(uz.pdf_no_text);
    return;
  }

  att.status = 'processing';
  att.ocrStatus = 'running';

  const onStage = (stage, info) => {
    let label = '';
    if (stage === 'rendering') label = uz.ocr_rendering;
    else if (stage === 'ocr') label = uz.ocr_running;
    else if (stage === 'vision') label = uz.ocr_vision;
    if (info && info.page && info.total) label += ` (${uz.ocr_page} ${info.page}/${info.total})`;
    else if (info && typeof info.progress === 'number' && info.progress > 0) {
      label += ` ${Math.round(info.progress * 100)}%`;
    }
    att.progress = label;
    renderAttachments();
  };

  try {
    let result;
    if (strategy === 'ocr') {
      result = await ocrPdf(att.base64, { onStage, langs: 'eng+rus', maxPages: 10 });
    } else {
      result = await visionPdf(att.base64, { onStage, maxPages: 5 });
    }

    att.text = result.text || '';
    att.chars = att.text.length;
    att.extractable = att.chars >= 8;
    att.ocrEngine = result.engine;
    att.ocrStatus = att.extractable ? 'done' : 'empty';
    att.progress = '';
    att.status = 'ready';
    delete att.base64; // free memory
    renderAttachments();
    toast(att.extractable ? uz.ocr_text_found : uz.ocr_no_result);
  } catch (e) {
    att.status = 'ready';
    att.progress = '';
    // Map asset/vision failures to clear, honest messages.
    if (e.message === 'SCRIPT_LOAD_FAILED' || e.message === 'TESSERACT_UNAVAILABLE' ||
        /Failed to fetch|dynamically imported module|import/.test(e.message || '')) {
      att.ocrStatus = 'assets_failed';
      toast(uz.ocr_assets_failed, 5000);
    } else if (e.code === 'AI_NOT_CONNECTED' || e.code === 'VISION_NOT_AVAILABLE') {
      att.ocrStatus = 'vision_unavailable';
      toast(uz.ocr_vision_unavailable, 5000);
    } else {
      att.ocrStatus = 'error';
      att.error = e.message || 'OCR_ERROR';
      toast(uz.pdf_error);
    }
    renderAttachments();
  }
}

// ---- Sidebar (mobile) -----------------------------------------------------
function openSidebar() { el.sidebar.classList.add('open'); el.backdrop.hidden = false; }
function closeSidebar() { el.sidebar.classList.remove('open'); el.backdrop.hidden = true; }

// ---- Composer sizing ------------------------------------------------------
function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 180) + 'px';
}

// ---- Tool switching -------------------------------------------------------
function setTool(task) {
  state.task = task;
  el.tools.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.task === task)));
  el.activeToolTitle.textContent = uz.toolTitles[task] || task;
  el.input.setAttribute('placeholder', uz.ph[task] || uz.composer_ph);
  if (!currentConv()) renderSuggestions();
}

// ---- Settings dialog ------------------------------------------------------
function populateVoices() {
  const voices = speech.getVoices();
  el.voiceSelect.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Avtomatik';
  el.voiceSelect.appendChild(auto);
  voices.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    el.voiceSelect.appendChild(o);
  });
  el.voiceSelect.value = state.settings.voice || '';
}

// ---- Health / status ------------------------------------------------------
async function refreshStatus() {
  const h = await api.getHealth();
  state.aiConnected = Boolean(h.aiConnected);
  state.visionAvailable = Boolean(h.visionAvailable);
  el.statusDot.className = 'dot ' + (h.aiConnected ? 'ok' : 'off');
  el.statusText.textContent = h.aiConnected ? uz.status_connected : uz.status_offline;
  const title = h.aiConnected
    ? `${uz.status_connected} (${h.provider})` +
      (h.visionAvailable ? ' • ' + uz.vision_ready : '')
    : uz.status_offline;
  el.statusText.closest('.topbar__status').title = title;
}

// ---- Event wiring ---------------------------------------------------------
function bind() {
  el.newChatBtn.onclick = newConversation;
  el.sendBtn.onclick = send;
  el.menuBtn.onclick = openSidebar;
  el.backdrop.onclick = closeSidebar;

  el.input.addEventListener('input', autoGrow);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  el.tools.forEach((b) => (b.onclick = () => { setTool(b.dataset.task); closeSidebar(); }));

  el.attachBtn.onclick = () => el.fileInput.click();
  el.fileInput.onchange = (e) => { handleFiles(e.target.files); el.fileInput.value = ''; };

  // Drag & drop
  el.chat.addEventListener('dragover', (e) => e.preventDefault());
  el.chat.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });

  // Theme toggle
  el.themeBtn.onclick = () =>
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  // Voice input
  el.micBtn.onclick = () => {
    if (!speech.recognitionSupported) { toast(uz.mic_unsupported); return; }
    if (el.micBtn.classList.contains('mic--active')) { speech.stopListening(); return; }
    el.micBtn.classList.add('mic--active');
    toast(uz.listening, 1500);
    speech.listen({
      lang: 'uz-UZ',
      onResult: (t) => {
        el.input.value = (el.input.value ? el.input.value + ' ' : '') + t;
        autoGrow();
      },
      onError: (err) => {
        if (err === 'unsupported') toast(uz.mic_unsupported);
      },
      onEnd: () => el.micBtn.classList.remove('mic--active'),
    });
  };

  // Settings
  el.settingsBtn.onclick = () => { populateVoices(); el.settingsDialog.showModal(); };
  el.themeSegment.querySelectorAll('button').forEach((b) => {
    b.onclick = () => applyTheme(b.dataset.themeVal);
  });
  el.ttsToggle.onchange = () => {
    state.settings.tts = el.ttsToggle.checked;
    store.saveSettings(state.settings);
  };
  el.ocrToggle.onchange = () => {
    state.settings.ocr = el.ocrToggle.checked;
    store.saveSettings(state.settings);
  };
  el.voiceSelect.onchange = () => {
    state.settings.voice = el.voiceSelect.value;
    store.saveSettings(state.settings);
  };
  el.clearDataBtn.onclick = () => {
    if (confirm(uz.confirm_clear)) {
      store.clearConversations();
      state.conversations = [];
      state.currentId = null;
      renderHistory();
      renderMessages();
      toast(uz.stopped);
    }
  };

  if (speech.ttsSupported) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
}

// ---- Init -----------------------------------------------------------------
function init() {
  applyI18n();
  el.aboutText.textContent = uz.about_text;
  applyTheme(state.settings.theme || 'dark');
  el.ttsToggle.checked = Boolean(state.settings.tts);
  el.ocrToggle.checked = Boolean(state.settings.ocr);
  if (el.ocrHint) el.ocrHint.textContent = uz.setting_ocr_hint;
  bind();
  setTool('chat');
  renderMessages();
  renderHistory();
  refreshStatus();
  setInterval(refreshStatus, 30000);
}

init();
