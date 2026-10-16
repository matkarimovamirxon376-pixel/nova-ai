// Thin client for the NOVA backend. No secrets live here — the server holds
// all provider keys. This module only talks to our own /api/* endpoints.

export async function getHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('health failed');
    return await res.json();
  } catch {
    return { ok: false, aiConnected: false, provider: 'none' };
  }
}

/**
 * Ask the backend to generate a reply.
 * Returns { text } on success, or throws an Error whose `.code` may be
 * 'AI_NOT_CONNECTED' so the UI can show an honest notice.
 */
export async function generate({ task, prompt, history }) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, prompt, history }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-json error */
  }

  if (!res.ok) {
    const err = new Error(data.message || data.error || 'request failed');
    err.code = data.error || 'ERROR';
    throw err;
  }
  return data;
}

/**
 * Ask the backend to analyse an image with a vision model.
 * Returns { text } or throws an Error with `.code` of AI_NOT_CONNECTED or
 * VISION_NOT_AVAILABLE so the UI can respond honestly.
 */
export async function vision({ prompt, dataUrl }) {
  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, dataUrl }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-json error */
  }

  if (!res.ok) {
    const err = new Error(data.message || data.error || 'request failed');
    err.code = data.error || 'ERROR';
    throw err;
  }
  return data;
}
