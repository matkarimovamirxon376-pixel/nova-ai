// Self-contained smoke test: starts the server in-process and exercises the
// HTTP endpoints using Node's built-in fetch. Verifies routing, static files,
// the honest AI_NOT_CONNECTED behaviour, and the path-traversal guard.

process.env.PORT = process.env.PORT || '3100';
process.env.AI_PROVIDER = 'none';

const base = `http://127.0.0.1:${process.env.PORT}`;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

await import('../server/server.js');
await new Promise((r) => setTimeout(r, 400)); // let listen() settle

// 1. health
{
  const r = await fetch(`${base}/api/health`);
  const j = await r.json();
  ok(r.status === 200, 'GET /api/health -> 200');
  ok(j.ok === true, 'health.ok is true');
  ok(j.aiConnected === false, 'health.aiConnected is false (provider=none)');
}

// 2. static index
{
  const r = await fetch(`${base}/`);
  const t = await r.text();
  ok(r.status === 200, 'GET / -> 200');
  ok(/NOVA AI/.test(t), 'index.html contains "NOVA AI"');
  ok((r.headers.get('content-type') || '').includes('text/html'), 'index content-type is html');
}

// 3. static assets
for (const [path, type] of [['/styles.css', 'text/css'], ['/js/app.js', 'javascript'], ['/favicon.svg', 'svg']]) {
  const r = await fetch(`${base}${path}`);
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes(type), `GET ${path} -> 200 ${type}`);
}

// 4. generate without AI must be honest (503 + AI_NOT_CONNECTED)
{
  const r = await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'chat', prompt: 'Salom' }),
  });
  const j = await r.json();
  ok(r.status === 503, 'POST /api/generate (no AI) -> 503');
  ok(j.error === 'AI_NOT_CONNECTED', 'error code is AI_NOT_CONNECTED (does not fake a reply)');
  ok(typeof j.text === 'undefined', 'no fabricated text field returned');
}

// 5. missing prompt validation
{
  const r = await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const j = await r.json();
  ok(r.status === 400 && j.error === 'MISSING_PROMPT', 'POST /api/generate {} -> 400 MISSING_PROMPT');
}

// 6. path traversal guard
{
  const r = await fetch(`${base}/..%2f..%2fserver%2fconfig.js`);
  const t = await r.text();
  ok(!/OPENAI_API_KEY/.test(t), 'path traversal cannot read server/config.js');
}

// 7. unknown API route
{
  const r = await fetch(`${base}/api/nope`);
  ok(r.status === 404, 'GET /api/nope -> 404');
}

// 8. health reports visionAvailable flag
{
  const r = await fetch(`${base}/api/health`);
  const j = await r.json();
  ok('visionAvailable' in j, 'health includes visionAvailable flag');
  ok(j.visionAvailable === false, 'visionAvailable is false (provider=none)');
}

// 9. PDF extraction endpoint — build a tiny FlateDecode PDF in-process.
{
  const zlib = await import('node:zlib');
  const content =
    'BT /F1 18 Tf 72 700 Td (NOVA PDF endpoint) Tj T* (ikkinchi qator) Tj ET';
  const stream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const parts = [];
  const off = [];
  const add = (s) => { parts.push(Buffer.from(s, 'latin1')); };
  const pos = () => parts.reduce((a, b) => a + b.length, 0);
  add('%PDF-1.4\n');
  off[1] = pos(); add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  off[2] = pos(); add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  off[3] = pos(); add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n');
  off[4] = pos();
  add(`4 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`);
  parts.push(stream);
  add('\nendstream\nendobj\n');
  const xrefPos = pos();
  let xref = 'xref\n0 5\n0000000000 65535 f \n';
  for (let i = 1; i <= 4; i++) xref += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  add(xref);
  const pdfBuf = Buffer.concat(parts);

  const r = await fetch(`${base}/api/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: pdfBuf.toString('base64'), name: 'test.pdf' }),
  });
  const j = await r.json();
  ok(r.status === 200, 'POST /api/pdf -> 200');
  ok(j.extractable === true, 'PDF reported extractable');
  ok(/NOVA PDF endpoint/.test(j.text || ''), 'extracted text contains expected content');
  ok(/ikkinchi qator/.test(j.text || ''), 'extracted multi-line text');
}

// 10. PDF endpoint rejects non-PDF input honestly.
{
  const r = await fetch(`${base}/api/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: Buffer.from('not a pdf').toString('base64') }),
  });
  const j = await r.json();
  ok(r.status === 400 && j.error === 'NOT_A_PDF', 'non-PDF -> 400 NOT_A_PDF');
}

// 11. PDF endpoint validates missing input.
{
  const r = await fetch(`${base}/api/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const j = await r.json();
  ok(r.status === 400 && j.error === 'MISSING_PDF', 'POST /api/pdf {} -> 400 MISSING_PDF');
}

// 12. Vision endpoint is honest when no provider is connected.
{
  const r = await fetch(`${base}/api/vision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'nima bu?', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
  });
  const j = await r.json();
  ok(r.status === 503, 'POST /api/vision (no AI) -> 503');
  ok(j.error === 'AI_NOT_CONNECTED', 'vision honest AI_NOT_CONNECTED (no faked analysis)');
  ok(typeof j.text === 'undefined', 'vision returns no fabricated text');
}

// 13. Vision endpoint validates missing image.
{
  const r = await fetch(`${base}/api/vision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const j = await r.json();
  ok(r.status === 400 && j.error === 'MISSING_IMAGE', 'POST /api/vision {} -> 400 MISSING_IMAGE');
}

// 14. Scanned-PDF DETECTION: an image-only PDF must be flagged non-extractable
//     with NO hallucinated text (requirement #1 + "no faking" #10).
{
  const zlib = await import('node:zlib');
  const imgStream = zlib.deflateSync(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]));
  const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q'; // only an image draw, no text ops
  const cStream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const parts = []; const off = [];
  const add = (s) => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'));
  const pos = () => parts.reduce((a, b) => a + b.length, 0);
  add('%PDF-1.4\n');
  off[1] = pos(); add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  off[2] = pos(); add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  off[3] = pos(); add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n');
  off[4] = pos(); add(`4 0 obj\n<< /Length ${cStream.length} /Filter /FlateDecode >>\nstream\n`); add(cStream); add('\nendstream\nendobj\n');
  off[5] = pos(); add(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imgStream.length} >>\nstream\n`); add(imgStream); add('\nendstream\nendobj\n');
  const xrefPos = pos();
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) xref += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  add(xref);
  const scannedPdf = Buffer.concat(parts);

  const r = await fetch(`${base}/api/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: scannedPdf.toString('base64'), name: 'scanned.pdf' }),
  });
  const j = await r.json();
  ok(r.status === 200, 'POST /api/pdf (scanned) -> 200');
  ok(j.extractable === false, 'scanned PDF flagged extractable:false (detection works)');
  ok(!j.text, 'scanned PDF returns NO fabricated text');
  ok(typeof j.warning === 'string' && j.warning.length > 0, 'scanned PDF includes an honest warning');
}

// 15. OCR strategy selector (pure logic) — all branches.
{
  const { chooseStrategy } = await import('../public/js/ocr.js');
  ok(chooseStrategy({ extractable: true, visionAvailable: false, ocrEnabled: false }) === 'none',
    'strategy: extractable -> none');
  ok(chooseStrategy({ extractable: false, visionAvailable: false, ocrEnabled: true }) === 'ocr',
    'strategy: ocr enabled -> ocr');
  ok(chooseStrategy({ extractable: false, visionAvailable: true, ocrEnabled: false }) === 'vision',
    'strategy: vision available -> vision');
  ok(chooseStrategy({ extractable: false, visionAvailable: true, ocrEnabled: true }) === 'ocr',
    'strategy: ocr beats vision when both -> ocr');
  ok(chooseStrategy({ extractable: false, visionAvailable: false, ocrEnabled: false }) === 'unavailable',
    'strategy: nothing available -> unavailable');
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
