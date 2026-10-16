// NOVA AI — zero-dependency Node.js backend.
// Serves the static frontend and exposes /api/* routes.
// All AI calls and secrets stay on the server; the client never sees any key.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { config, isAiConnected, isVisionAvailable } from './config.js';
import {
  generate,
  generateVision,
  AiNotConnectedError,
  VisionNotAvailableError,
  ProviderError,
} from './ai-provider.js';
import { extractPdfText } from './pdf.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const buf = await readBody(req, config.maxUploadBytes);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

// --- API handlers ----------------------------------------------------------

function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    aiConnected: isAiConnected(),
    visionAvailable: isVisionAvailable(),
    provider: config.aiProvider,
    time: new Date().toISOString(),
  });
}

// Diagnostika: AI provayderga haqiqiy test so'rov yuboradi va ANIQ natijani
// qaytaradi (kalit noto'g'rimi, model noto'g'rimi, tarmoqmi). Kalitning o'zi
// HECH QACHON qaytarilmaydi — faqat uning bor/yo'qligi va uzunligi.
// Brauzerda ochib ko'rish uchun:  <sayt>/api/diagnose
async function handleDiagnose(req, res) {
  const keyLen = (config.openai.apiKey || config.gemini.apiKey || '').length;
  const base = {
    provider: config.aiProvider,
    effectiveProvider: config.effectiveProvider,
    aiConnected: isAiConnected(),
    apiKeyPresent: keyLen > 0,
    apiKeyLength: keyLen, // faqat uzunlik, kalitning o'zi emas
    model: config.openai.model,
    baseUrl: config.openai.baseUrl,
  };
  if (!isAiConnected()) {
    return sendJson(res, 200, {
      ...base,
      result: 'NOT_CONFIGURED',
      message: 'AI_PROVIDER yoki API kalit sozlanmagan.',
    });
  }
  try {
    const text = await generate({ task: 'chat', prompt: "Faqat 'OK' deb javob ber." });
    sendJson(res, 200, { ...base, result: 'SUCCESS', sample: (text || '').slice(0, 80) });
  } catch (e) {
    sendJson(res, 200, {
      ...base,
      result: 'ERROR',
      errorCode: e.code || 'UNKNOWN',
      message: e.message || String(e),
    });
  }
}

// Extract text from an uploaded PDF (sent as base64). Dependency-free; runs
// locally with no third-party service, so it works even without an AI key.
async function handlePdf(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (e) {
    const code = e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return sendJson(res, code, { error: e.message });
  }

  const { base64, name } = payload || {};
  if (!base64 || typeof base64 !== 'string') {
    return sendJson(res, 400, { error: 'MISSING_PDF' });
  }

  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return sendJson(res, 400, { error: 'INVALID_BASE64' });
  }

  try {
    const result = extractPdfText(buf);
    sendJson(res, 200, { name: name || 'document.pdf', ...result });
  } catch (e) {
    const map = {
      NOT_A_PDF: 400,
      PDF_TOO_LARGE: 413,
      PDF_INPUT_NOT_BUFFER: 400,
    };
    sendJson(res, map[e.message] || 500, { error: e.message || 'PDF_PARSE_ERROR' });
  }
}

// Analyse an uploaded image with a vision-capable model (keys stay server-side).
async function handleVision(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (e) {
    const code = e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return sendJson(res, code, { error: e.message });
  }

  const { dataUrl, prompt } = payload || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return sendJson(res, 400, { error: 'MISSING_IMAGE' });
  }

  try {
    const text = await generateVision({ prompt: prompt || '', dataUrl });
    sendJson(res, 200, { text });
  } catch (e) {
    if (e instanceof AiNotConnectedError) {
      return sendJson(res, 503, {
        error: 'AI_NOT_CONNECTED',
        message:
          'AI xizmati hali ulanmagan. Rasm tahlili uchun server tomonida vision modelni sozlang (README ga qarang).',
      });
    }
    if (e instanceof VisionNotAvailableError) {
      return sendJson(res, 503, {
        error: 'VISION_NOT_AVAILABLE',
        message:
          'Joriy provayderda rasm tahlili mavjud emas. Vision modelni sozlang (masalan OpenAI gpt-4o, Gemini, yoki Ollama llava).',
      });
    }
    if (e instanceof ProviderError) {
      console.error(`[vision] provider error [${e.code}]:`, e.message);
      const status = e.code === 'RATE_LIMITED' ? 429 : 502;
      return sendJson(res, status, { error: e.code, message: e.message });
    }
    // Log a concise message only — avoid dumping stack traces / upstream URLs.
    console.error('[vision] upstream error:', e.message);
    sendJson(res, 502, { error: 'AI_UPSTREAM_ERROR', message: e.message });
  }
}

async function handleGenerate(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (e) {
    const code = e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return sendJson(res, code, { error: e.message });
  }

  const { task, prompt, history } = payload || {};
  if (!prompt || typeof prompt !== 'string') {
    return sendJson(res, 400, { error: 'MISSING_PROMPT' });
  }

  try {
    const text = await generate({
      task: typeof task === 'string' ? task : 'chat',
      history: Array.isArray(history) ? history.slice(-12) : [],
      prompt,
    });
    sendJson(res, 200, { text });
  } catch (e) {
    if (e instanceof AiNotConnectedError) {
      // Honest, explicit signal: the UI shows a "not connected" notice.
      return sendJson(res, 503, {
        error: 'AI_NOT_CONNECTED',
        message:
          "AI xizmati hali ulanmagan. Haqiqiy javoblar olish uchun server tomonida AI provayderni sozlang (README ga qarang).",
      });
    }
    if (e instanceof ProviderError) {
      // Clear, specific code (MISSING_KEY | INVALID_CREDENTIALS | RATE_LIMITED
      // | MODEL_NOT_FOUND | NETWORK | UPSTREAM). Never contains the API key.
      console.error(`[generate] provider error [${e.code}]:`, e.message);
      const status = e.code === 'RATE_LIMITED' ? 429
        : e.code === 'INVALID_CREDENTIALS' || e.code === 'MISSING_KEY' ? 502
        : 502;
      return sendJson(res, status, { error: e.code, message: e.message });
    }
    // Log a concise message only — avoid dumping stack traces / upstream URLs.
    console.error('[generate] upstream error:', e.message);
    sendJson(res, 502, { error: 'AI_UPSTREAM_ERROR', message: e.message });
  }
}

// --- Static file serving ---------------------------------------------------

async function serveStatic(req, res, urlPath) {
  // Prevent path traversal.
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(config.PUBLIC_DIR, safe);

  if (!filePath.startsWith(config.PUBLIC_DIR)) {
    return sendJson(res, 403, { error: 'FORBIDDEN' });
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error('EISDIR');
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    // SPA-style fallback to index.html for unknown non-API routes.
    try {
      const data = await readFile(join(config.PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(data);
    } catch {
      sendJson(res, 404, { error: 'NOT_FOUND' });
    }
  }
}

// --- Router ----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const { method } = req;
  const url = req.url || '/';

  try {
    if (url.startsWith('/api/')) {
      if (url === '/api/health' && method === 'GET') return handleHealth(req, res);
      if (url === '/api/diagnose' && method === 'GET') return handleDiagnose(req, res);
      if (url === '/api/generate' && method === 'POST') return handleGenerate(req, res);
      if (url === '/api/pdf' && method === 'POST') return handlePdf(req, res);
      if (url === '/api/vision' && method === 'POST') return handleVision(req, res);
      return sendJson(res, 404, { error: 'API_NOT_FOUND' });
    }
    if (method !== 'GET' && method !== 'HEAD') {
      return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    return serveStatic(req, res, url);
  } catch (e) {
    console.error('[server] unhandled error:', e);
    sendJson(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

// Collect this machine's IPv4 addresses, classifying each so we can show the
// user a URL that is actually reachable from a phone on the same Wi-Fi.
//   - "lan":        real private LAN addresses (192.168.x / 10.x / 172.16-31.x)
//   - "linkLocal":  169.254.x.x — NOT routable from other devices
//   - "other":      public / unusual addresses
function classifyAddresses() {
  const nets = networkInterfaces();
  const lan = [];
  const linkLocal = [];
  const other = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const ip = net.address;
      if (ip.startsWith('169.254.')) linkLocal.push(ip);
      else if (
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      ) {
        lan.push(ip);
      } else {
        other.push(ip);
      }
    }
  }
  return { lan, linkLocal, other };
}

server.listen(config.port, config.host, () => {
  const { lan, linkLocal, other } = classifyAddresses();
  console.log('\n  NOVA AI server ishga tushdi');
  console.log(`  Local:    http://localhost:${config.port}`);
  // Prefer real LAN addresses for phone access.
  for (const ip of [...lan, ...other]) {
    console.log(`  Network:  http://${ip}:${config.port}   (phone / same Wi-Fi)`);
  }
  if (lan.length === 0 && other.length === 0 && linkLocal.length > 0) {
    console.log(
      `  Network:  http://${linkLocal[0]}:${config.port}   ` +
        '(link-local — likely NOT reachable from a phone)'
    );
  }
  console.log(`  Provider: ${config.aiProvider}`);
  console.log(`  AI holati: ${isAiConnected() ? 'ULANGAN' : 'ULANMAGAN (demo rejimi)'}\n`);
});
