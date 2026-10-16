// Pluggable AI provider adapter.
//
// Design goals:
//  - Keep all secrets server-side (keys are read from config, never returned).
//  - Support multiple providers behind one interface.
//  - When no provider is configured, DO NOT fabricate AI output. Instead throw
//    a well-known "AI_NOT_CONNECTED" error so the UI can be honest about it.
//
// Each task (chat, translate, essay, english, math) is turned into a system
// prompt + user message, then sent to whichever provider is active.

import { config, isAiConnected, isVisionAvailable } from './config.js';

export class AiNotConnectedError extends Error {
  constructor() {
    super('AI service is not connected.');
    this.code = 'AI_NOT_CONNECTED';
  }
}

export class VisionNotAvailableError extends Error {
  constructor() {
    super('Vision analysis is not available with the current provider.');
    this.code = 'VISION_NOT_AVAILABLE';
  }
}

// Raised for provider-side problems with a stable, non-sensitive code so the
// UI and logs can be clear WITHOUT ever including the API key.
export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // e.g. INVALID_CREDENTIALS | RATE_LIMITED | NETWORK | UPSTREAM
  }
}

// Map an upstream HTTP status to a clear, user-facing (Uzbek) message and a
// stable code. The raw provider body is intentionally NOT echoed verbatim to
// the client to avoid leaking anything sensitive.
function classifyHttpStatus(providerName, status) {
  if (status === 401 || status === 403) {
    return new ProviderError(
      'INVALID_CREDENTIALS',
      `${providerName}: API kalit notogri yoki ruxsat yoq (HTTP ${status}). ` +
        '.env dagi kalitni tekshiring.'
    );
  }
  if (status === 429) {
    return new ProviderError(
      'RATE_LIMITED',
      `${providerName}: sorovlar chegarasi (rate limit) oshib ketdi (HTTP 429). ` +
        'Biroz kuting yoki tekin limitni tekshiring.'
    );
  }
  if (status === 404) {
    return new ProviderError(
      'MODEL_NOT_FOUND',
      `${providerName}: model yoki endpoint topilmadi (HTTP 404). ` +
        'Model nomini va BASE_URL ni tekshiring.'
    );
  }
  if (status >= 500) {
    return new ProviderError(
      'UPSTREAM',
      `${providerName}: provayder tomonida xatolik (HTTP ${status}). Keyinroq urinib koring.`
    );
  }
  return new ProviderError('UPSTREAM', `${providerName}: kutilmagan javob (HTTP ${status}).`);
}

// Wrap fetch so network failures become a clear NETWORK ProviderError rather
// than a raw TypeError. Never includes the URL (which may carry a key).
async function safeFetch(providerName, url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new ProviderError(
      'NETWORK',
      `${providerName}: tarmoq ulanishi muvaffaqiyatsiz. Internet yoki endpoint manzilini tekshiring.`
    );
  }
}

// Split a data URL ("data:image/png;base64,....") into { mime, base64 }.
// Also accepts a bare base64 string (assumes PNG).
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (m) {
    return { mime: m[1] || 'image/png', base64: m[3] || '' };
  }
  return { mime: 'image/png', base64: String(dataUrl || '') };
}

// Build a task-specific system prompt. All instructions ask the model to reply
// in Uzbek by default, matching the app's interface language.
function systemPromptFor(task) {
  const base =
    'Siz NOVA AI yordamchisisiz. Odatda foydalanuvchiga ozbek tilida, ' +
    'aniq va foydali javob bering. Agar foydalanuvchi boshqa tilda sorasa, ' +
    'oshaa tilda javob bering.';

  switch (task) {
    case 'translate':
      return (
        'Siz professional tarjimonsiz. Berilgan matnni sorangan tilga ' +
        'tabiiy va aniq tarjima qiling. Faqat tarjimani qaytaring.'
      );
    case 'essay':
      return (
        base +
        ' Siz tajribali muallifsiz. Tuzilmali, mantiqiy va ozbek tili ' +
        'qoidalariga mos insho yoki hisobot yozing (kirish, asosiy qism, xulosa).'
      );
    case 'english':
      return (
        'Siz ingliz tili ouqituvchisisiz. Grammatika, lugat va talaffuzni ' +
        'ozbek tilida tushuntiring. Misollar keltiring va xatolarni mehribonlik ' +
        'bilan tuzating.'
      );
    case 'math':
      return (
        base +
        ' Siz matematika ouqituvchisisiz. Masalani bosqichma-bosqich yeching ' +
        'va har bir qadamni ozbek tilida tushuntiring.'
      );
    case 'document':
      return (
        base +
        ' Sizga hujjat matni beriladi. Uni tahlil qiling, qisqa xulosa va ' +
        'asosiy fikrlarni ajrating.'
      );
    case 'image':
      return (
        base +
        ' Sizga rasm tavsifi yoki mazmuni beriladi. Uni tahlil qiling va ' +
        'tushuntiring.'
      );
    default:
      return base;
  }
}

// --- Provider implementations ---------------------------------------------

async function callOpenAI(messages) {
  const { apiKey, baseUrl, model } = config.openai;
  // Works with any OpenAI-compatible endpoint (OpenAI, Groq, local, …).
  const name = /groq/i.test(baseUrl) ? 'Groq' : 'OpenAI-compatible';
  if (!apiKey) {
    throw new ProviderError('MISSING_KEY', `${name}: API kalit (OPENAI_API_KEY) sozlanmagan.`);
  }
  const res = await safeFetch(name, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!res.ok) throw classifyHttpStatus(name, res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(messages) {
  const { apiKey, model } = config.gemini;
  if (!apiKey) {
    throw new ProviderError('MISSING_KEY', 'Gemini: API kalit (GEMINI_API_KEY) sozlanmagan.');
  }
  // Flatten the chat into Gemini's "contents" format.
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const system = messages.find((m) => m.role === 'system');
  const body = {
    contents,
    ...(system
      ? { systemInstruction: { parts: [{ text: system.content }] } }
      : {}),
  };
  // SECURITY: Gemini passes the key as a URL query param. We send it via the
  // x-goog-api-key header instead so the key never appears in a URL (and thus
  // never in any URL-based log).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await safeFetch('Gemini', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw classifyHttpStatus('Gemini', res.status);
  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() ||
    ''
  );
}

async function callOllama(messages) {
  const { baseUrl, model } = config.ollama;
  const res = await safeFetch('Ollama', `${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!res.ok) throw classifyHttpStatus('Ollama', res.status);
  const data = await res.json();
  return data?.message?.content?.trim() || '';
}

// --- Public API ------------------------------------------------------------

/**
 * Generate an AI reply.
 * @param {object} opts
 * @param {string} opts.task  one of chat|translate|essay|english|math|document|image
 * @param {Array<{role:string,content:string}>} opts.history prior turns (optional)
 * @param {string} opts.prompt the user's latest message / content
 * @returns {Promise<string>}
 */
export async function generate({ task = 'chat', history = [], prompt }) {
  if (!isAiConnected()) {
    throw new AiNotConnectedError();
  }

  const messages = [
    { role: 'system', content: systemPromptFor(task) },
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content || ''),
    })),
    { role: 'user', content: String(prompt || '') },
  ];

  switch (config.effectiveProvider) {
    case 'openai':
      return callOpenAI(messages);
    case 'gemini':
      return callGemini(messages);
    case 'ollama':
      return callOllama(messages);
    default:
      throw new AiNotConnectedError();
  }
}

// --- Vision (image analysis) provider calls --------------------------------

async function visionOpenAI({ system, prompt, mime, base64 }) {
  const { apiKey, baseUrl, visionModel } = config.openai;
  const name = /groq/i.test(baseUrl) ? 'Groq' : 'OpenAI-compatible';
  if (!apiKey) throw new ProviderError('MISSING_KEY', `${name}: API kalit sozlanmagan.`);
  const res = await safeFetch(name, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      temperature: 0.5,
    }),
  });
  if (!res.ok) throw classifyHttpStatus(`${name} vision`, res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function visionGemini({ system, prompt, mime, base64 }) {
  const { apiKey, visionModel } = config.gemini;
  if (!apiKey) throw new ProviderError('MISSING_KEY', 'Gemini: API kalit sozlanmagan.');
  // Key sent via header, never in the URL (see callGemini for rationale).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent`;
  const res = await safeFetch('Gemini vision', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw classifyHttpStatus('Gemini vision', res.status);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() || '';
}

async function visionOllama({ system, prompt, base64 }) {
  const { baseUrl, visionModel } = config.ollama;
  const res = await safeFetch('Ollama vision', `${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: visionModel,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt, images: [base64] },
      ],
    }),
  });
  if (!res.ok) throw classifyHttpStatus('Ollama vision', res.status);
  const data = await res.json();
  return data?.message?.content?.trim() || '';
}

/**
 * Analyse an image with a vision-capable model.
 * @param {object} opts
 * @param {string} opts.prompt   the user's question about the image
 * @param {string} opts.dataUrl  image as a data URL or bare base64
 * @returns {Promise<string>}
 */
export async function generateVision({ prompt, dataUrl }) {
  if (!isAiConnected()) throw new AiNotConnectedError();
  if (!isVisionAvailable()) throw new VisionNotAvailableError();

  const { mime, base64 } = parseDataUrl(dataUrl);
  if (!base64) throw new Error('EMPTY_IMAGE');

  const system = systemPromptFor('image');
  const userPrompt =
    prompt && prompt.trim()
      ? prompt
      : 'Ushbu rasmni batafsil tasvirlab bering va undagi muhim narsalarni ozbek tilida tushuntiring.';

  const args = { system, prompt: userPrompt, mime, base64 };
  switch (config.effectiveProvider) {
    case 'openai':
      return visionOpenAI(args);
    case 'gemini':
      return visionGemini(args);
    case 'ollama':
      return visionOllama(args);
    default:
      throw new VisionNotAvailableError();
  }
}
