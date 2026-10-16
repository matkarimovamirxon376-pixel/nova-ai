// Centralised server configuration.
// Secrets are read ONLY from environment variables and never sent to the client.
// Copy .env.example to .env and fill in values, or export them in your shell.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Minimal .env loader (no dependencies) --------------------------------
// Loads KEY=VALUE lines from a .env file at the project root into process.env
// without overwriting variables already present in the real environment.
function loadDotEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env file — that's fine, we fall back to real env / defaults.
  }
}

loadDotEnv();

// The effective provider. "groq" is handled by the OpenAI-compatible adapter,
// so we normalise it to "openai" for the request path while keeping a Groq
// default base URL and reading GROQ_API_KEY.
const RAW_PROVIDER = (process.env.AI_PROVIDER || 'none').toLowerCase();

// Build the OpenAI-compatible config, with Groq-aware defaults when
// AI_PROVIDER=groq. For Groq we accept GROQ_API_KEY (or OPENAI_API_KEY as a
// fallback) and default to Groq's endpoint + a free Llama model.
function resolveOpenAiLike() {
  const isGroq = RAW_PROVIDER === 'groq';
  if (isGroq) {
    // Default model: Groq'ning hozirgi bepul tier modeli.
    // Eslatma: eski "llama-3.3-70b-versatile" va "llama-3.1-8b-instant" Groq
    // tomonidan 2026-avgustda bepul/developer tier'dan o'chirildi. Groq rasman
    // "openai/gpt-oss-20b" ni almashtiruvchi sifatida tavsiya qiladi.
    const model = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-oss-20b';
    return {
      apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.GROQ_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
      model,
      // Groq multimodal model (e.g. a Llama vision model). Falls back to the
      // text model, but vision only works if the model supports images.
      visionModel: process.env.GROQ_VISION_MODEL || process.env.OPENAI_VISION_MODEL || model,
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    visionModel: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

export const config = {
  ROOT,
  PUBLIC_DIR: join(ROOT, 'public'),
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),

  // AI provider selection.
  // Supported: "none" | "openai" | "groq" | "gemini" | "ollama"
  //  - "groq" is a free, OpenAI-compatible provider; it reuses the OpenAI
  //    adapter with Groq's base URL and the GROQ_API_KEY.
  // Default is "none" so the app runs out-of-the-box WITHOUT any paid service
  // and WITHOUT pretending AI works.
  aiProvider: RAW_PROVIDER,
  // Provider actually used by the request adapters. "groq" uses the
  // OpenAI-compatible path, so it resolves to "openai" here.
  effectiveProvider: RAW_PROVIDER === 'groq' ? 'openai' : RAW_PROVIDER,

  // Provider credentials / endpoints (server-side only).
  openai: resolveOpenAiLike(),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    // Gemini 1.5 flash/pro are natively multimodal.
    visionModel: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.1',
    // A multimodal model must be set for vision, e.g. "llava" or "llama3.2-vision".
    visionModel: process.env.OLLAMA_VISION_MODEL || 'llava',
  },

  // Upload limits (bytes). Keep modest for the first version.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024),
};

// Whether a real AI backend is configured. The client is told this boolean
// (never the key itself) so the UI can show an honest "not connected" state.
export function isAiConnected() {
  switch (config.effectiveProvider) {
    case 'openai':
      return Boolean(config.openai.apiKey);
    case 'gemini':
      return Boolean(config.gemini.apiKey);
    case 'ollama':
      return Boolean(config.ollama.baseUrl);
    default:
      return false;
  }
}

// Whether image (vision) analysis can be performed. For the cloud providers a
// key is enough (their default models are multimodal); for Ollama a vision
// model must be configured. The client is told this boolean so the UI can be
// honest about image analysis specifically.
export function isVisionAvailable() {
  switch (config.effectiveProvider) {
    case 'openai':
      return Boolean(config.openai.apiKey);
    case 'gemini':
      return Boolean(config.gemini.apiKey);
    case 'ollama':
      return Boolean(config.ollama.baseUrl && config.ollama.visionModel);
    default:
      return false;
  }
}
