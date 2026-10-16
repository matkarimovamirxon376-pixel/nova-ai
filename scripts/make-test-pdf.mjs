// Generates two tiny valid PDFs for testing the extractor:
//   /tmp/plain.pdf     — uncompressed content stream
//   /tmp/flate.pdf     — FlateDecode-compressed content stream
// Both contain known text so the smoke test can assert on it.

import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

function buildPdf(contentStreamBytes, filter) {
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  const streamDict = `<< /Length ${contentStreamBytes.length}${filter ? ' /Filter /' + filter : ''} >>`;
  // object 4 is the stream — handled specially below
  objs.push(null);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets = [];
  const parts = [pdf];

  const pushObj = (num, bodyBuf) => {
    offsets[num] = parts.reduce((a, b) => a + b.length, 0);
    parts.push(Buffer.concat([
      Buffer.from(`${num} 0 obj\n`, 'latin1'),
      bodyBuf,
      Buffer.from('\nendobj\n', 'latin1'),
    ]));
  };

  pushObj(1, Buffer.from(objs[0], 'latin1'));
  pushObj(2, Buffer.from(objs[1], 'latin1'));
  pushObj(3, Buffer.from(objs[2], 'latin1'));
  // object 4: content stream
  offsets[4] = parts.reduce((a, b) => a + b.length, 0);
  parts.push(Buffer.concat([
    Buffer.from(`4 0 obj\n${streamDict}\nstream\n`, 'latin1'),
    contentStreamBytes,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]));
  pushObj(5, Buffer.from(objs[4], 'latin1'));

  const xrefPos = parts.reduce((a, b) => a + b.length, 0);
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  parts.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(parts);
}

const content =
  'BT /F1 18 Tf 72 700 Td (NOVA AI PDF test) Tj T* (Ikkinchi qator matni) Tj ' +
  '[(Massiv )-250(ichidagi )-250(matn)] TJ ET';
const raw = Buffer.from(content, 'latin1');

writeFileSync('/tmp/plain.pdf', buildPdf(raw, null));
writeFileSync('/tmp/flate.pdf', buildPdf(zlib.deflateSync(raw), 'FlateDecode'));
console.log('Wrote /tmp/plain.pdf and /tmp/flate.pdf');
