// End-to-end integration test proving the secure backend AI path actually
// works when a provider IS configured — WITHOUT any paid service or network.
//
// It spins up a tiny local OpenAI-compatible mock server, points NOVA's
// OPENAI_BASE_URL at it, and verifies that:
//   - /api/health reports aiConnected:true, visionAvailable:true
//   - /api/generate returns the model's real reply (round-trip)
//   - /api/vision returns the model's real reply for an image
//   - the API key is sent to the provider but never leaked to the client
//
// This lets us confirm the integration end-to-end here, where real external
// AI endpoints are blocked by the sandbox.

import { createServer } from 'node:http';

let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

// ---- 1. Mock OpenAI-compatible provider ----------------------------------
let sawAuthHeader = null;
let sawVisionImage = false;
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    sawAuthHeader = req.headers['authorization'] || null;
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch {}
    // Detect a vision request (content is an array with an image_url part).
    const last = payload.messages?.[payload.messages.length - 1];
    const isVision = Array.isArray(last?.content) &&
      last.content.some((p) => p.type === 'image_url');
    if (isVision) sawVisionImage = true;
    const reply = isVision
      ? 'Rasmda qizil va kok ranglar bor.'
      : 'Salom! Men NOVA AI yordamchisiman.';
    const out = JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);
  });
});
const mockPort = 4555;
await new Promise((r) => mock.listen(mockPort, r));
console.log(`mock OpenAI-compatible provider on :${mockPort}`);

// ---- 2. Boot NOVA pointed at the mock provider ---------------------------
process.env.PORT = process.env.PORT || '3300';
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'sk-secret-should-not-leak';
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${mockPort}`;
process.env.OPENAI_MODEL = 'mock-model';
process.env.OPENAI_VISION_MODEL = 'mock-vision';

const base = `http://127.0.0.1:${process.env.PORT}`;
await import('../server/server.js');
await new Promise((r) => setTimeout(r, 400));

// ---- 3. Assertions --------------------------------------------------------
{
  const j = await (await fetch(`${base}/api/health`)).json();
  ok(j.aiConnected === true, 'health: aiConnected true when provider configured');
  ok(j.visionAvailable === true, 'health: visionAvailable true');
  ok(j.provider === 'openai', 'health: provider name exposed (openai)');
  ok(!JSON.stringify(j).includes('sk-secret'), 'health: API key NOT leaked to client');
}
{
  const j = await (await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'chat', prompt: 'Salom' }),
  })).json();
  ok(/NOVA AI yordamchisiman/.test(j.text || ''), 'generate: real model reply round-trips through backend');
  ok(!('error' in j), 'generate: no error when connected');
}
{
  const j = await (await fetch(`${base}/api/vision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Nima bu?', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
  })).json();
  ok(sawVisionImage, 'vision: backend forwarded the image to the provider');
  ok(/qizil va kok/.test(j.text || ''), 'vision: real model reply round-trips');
}
{
  ok(sawAuthHeader === 'Bearer sk-secret-should-not-leak',
    'security: API key sent server->provider via Authorization header (never to browser)');
}

mock.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
