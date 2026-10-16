// Generates a "scanned" PDF: a page whose only content is an embedded image
// (an image XObject drawn with `Do`), with NO text operators. This simulates
// a scanned document so we can verify that the extractor correctly reports
// extractable:false (detection) rather than hallucinating text.
//
// The image is a tiny raw-RGB bitmap (uncompressed, /FlateDecode) — valid PDF,
// no text whatsoever.

import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

// 2x2 RGB image data (12 bytes), compressed.
const imgRaw = Buffer.from([
  255, 0, 0, 0, 255, 0,
  0, 0, 255, 255, 255, 0,
]);
const imgStream = zlib.deflateSync(imgRaw);

// Page content: draw the image to fill the page. No BT/Tj/TJ anywhere.
const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
const contentStream = zlib.deflateSync(Buffer.from(content, 'latin1'));

const parts = [];
const off = [];
const add = (s) => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'));
const pos = () => parts.reduce((a, b) => a + b.length, 0);

add('%PDF-1.4\n');
off[1] = pos(); add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
off[2] = pos(); add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
off[3] = pos();
add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
    '/Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n');
off[4] = pos();
add(`4 0 obj\n<< /Length ${contentStream.length} /Filter /FlateDecode >>\nstream\n`);
add(contentStream); add('\nendstream\nendobj\n');
off[5] = pos();
add(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
    `/Length ${imgStream.length} >>\nstream\n`);
add(imgStream); add('\nendstream\nendobj\n');

const xrefPos = pos();
let xref = 'xref\n0 6\n0000000000 65535 f \n';
for (let i = 1; i <= 5; i++) xref += String(off[i]).padStart(10, '0') + ' 00000 n \n';
xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
add(xref);

writeFileSync('/tmp/scanned.pdf', Buffer.concat(parts));
console.log('Wrote /tmp/scanned.pdf (image-only, no text)');
