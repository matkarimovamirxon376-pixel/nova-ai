// Per-task end-to-end verification of the AI path (chat, translate, essay,
// english, math, document). Proves each task reaches the backend with its
// correct, distinct system prompt and that the provider's reply round-trips
// through /api/generate.
//
// HONESTY: no real AI model is reachable from this sandbox, so this uses a
// LOCAL mock provider that echoes back the system prompt it received. That
// lets us verify the ROUTING / PLUMBING for every task is real and correct —
// it does NOT prove the quality of a real model's answer (that requires a
// configured provider, see README / npm run check:ai).

import { createServer } from 'node:http';

let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

// Mock OpenAI-compatible provider: echoes the system prompt + user message so
// we can assert the backend built the right request for each task.
const seen = [];
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch {}
    const sys = payload.messages?.find((m) => m.role === 'system')?.content || '';
    const user = payload.messages?.filter((m) => m.role === 'user').pop()?.content || '';
    seen.push({ sys, user });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: `[SYS]${sys}` } }] }));
  });
});
await new Promise((r) => mock.listen(4700, r));

process.env.PORT = process.env.PORT || '3700';
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'sk-local-mock';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:4700';
process.env.OPENAI_MODEL = 'mock';

const base = `http://127.0.0.1:${process.env.PORT}`;
await import('../server/server.js');
await new Promise((r) => setTimeout(r, 400));

async function gen(task, prompt) {
  const r = await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, prompt }),
  });
  return { status: r.status, body: await r.json() };
}

// Distinct markers expected in each task's system prompt.
const cases = [
  ['translate', 'Hello world', 'tarjimon'],       // translator persona
  ['essay', 'Vatan haqida insho', 'muallif'],      // writer persona
  ['english', 'Present Perfect', 'ingliz tili'],   // english teacher
  ['math', '2x+5=15', 'matematika'],               // math teacher
  ['document', 'uzun matn', 'hujjat matni'],       // document analyst
  ['chat', 'Salom', 'NOVA AI yordamchisisiz'],     // default assistant
];

for (const [task, prompt, marker] of cases) {
  const { status, body } = await gen(task, prompt);
  ok(status === 200, `[${task}] /api/generate -> 200`);
  ok(typeof body.text === 'string' && body.text.length > 0, `[${task}] reply round-trips`);
  ok((body.text || '').includes(marker), `[${task}] uses correct system prompt ("${marker}")`);
}

// Prove the tasks produced DIFFERENT system prompts (not one generic prompt).
const distinctSys = new Set(seen.map((s) => s.sys));
ok(distinctSys.size >= 5, `tasks produce distinct system prompts (${distinctSys.size} unique)`);

// Prove the user's text actually reached the provider.
ok(seen.some((s) => s.user.includes('2x+5=15')), 'user prompt text forwarded to provider');

mock.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
