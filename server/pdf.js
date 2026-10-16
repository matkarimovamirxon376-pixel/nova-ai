// Dependency-free PDF text extraction.
//
// This parses the raw PDF bytes and pulls text out of content streams. It
// uses only Node's built-in `zlib` to inflate FlateDecode streams (the most
// common compression in modern PDFs). No third-party library.
//
// Scope / honesty:
//  - Works well for text-based PDFs (exported from word processors, most
//    reports, articles). Handles Tj / TJ / ' / " text operators, octal and
//    hex string escapes, and PDFDocEncoding -> text for the ASCII range.
//  - Does NOT do OCR. Scanned/image-only PDFs contain no extractable text and
//    will return little or nothing — we report that honestly to the caller.
//  - Does not resolve every exotic font encoding (e.g. custom CMaps); such
//    PDFs may yield partial text.

import zlib from 'node:zlib';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

// --- low-level helpers -----------------------------------------------------

// Inflate a FlateDecode stream, tolerating a few leading junk bytes and
// trying both zlib (with header) and raw deflate.
function tryInflate(buf) {
  // Candidate buffers: as-is, plus variants that re-append a trailing EOL byte
  // in case a writer's EOL was over-trimmed, and leading-junk-skipped variants.
  const withCr = Buffer.concat([buf, Buffer.from([0x0d])]);
  const withLf = Buffer.concat([buf, Buffer.from([0x0a])]);
  const attempts = [
    () => zlib.inflateSync(buf),
    () => zlib.inflateRawSync(buf),
    () => zlib.inflateSync(withCr),
    () => zlib.inflateSync(withLf),
    () => zlib.inflateSync(buf.subarray(1)),
    () => zlib.inflateSync(buf.subarray(2)),
  ];
  for (const fn of attempts) {
    try {
      const out = fn();
      if (out && out.length) return out;
    } catch {
      /* try next */
    }
  }
  return null;
}

// Find every "stream ... endstream" segment and return its raw bytes together
// with the dictionary text that immediately precedes it (so we can detect the
// filter used).
function extractStreams(buf) {
  const streams = [];
  const sKey = Buffer.from('stream');
  const eKey = Buffer.from('endstream');
  let idx = 0;
  while (true) {
    // Find a "stream" keyword that is NOT part of "endstream".
    let s = buf.indexOf(sKey, idx);
    while (s > 2 && buf.subarray(s - 3, s).toString('latin1') === 'end') {
      s = buf.indexOf(sKey, s + sKey.length);
    }
    if (s === -1) break;

    // Dictionary preceding this stream (look back a bounded window).
    const dictStart = Math.max(0, s - 400);
    const dict = buf.subarray(dictStart, s).toString('latin1');

    // Data starts after the keyword and the following EOL (\r\n, \n, or \r).
    let dataStart = s + sKey.length;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a || buf[dataStart] === 0x0d) dataStart += 1;

    const e = buf.indexOf(eKey, dataStart);
    if (e === -1) break;

    // Prefer the exact /Length from the dictionary. This is critical: binary
    // stream data (e.g. deflate) can legitimately END in 0x0d/0x0a, so
    // blindly trimming trailing EOL bytes corrupts the stream. /Length gives
    // the precise byte count.
    const lenMatch = /\/Length\s+(\d+)/.exec(dict);
    let dataEnd;
    if (lenMatch) {
      const len = Number(lenMatch[1]);
      const byLen = dataStart + len;
      // Trust /Length only if it lands at (or just before) endstream.
      if (byLen <= e && e - byLen <= 2) {
        dataEnd = byLen;
      }
    }
    if (dataEnd === undefined) {
      // Unknown/indirect length: fall back to the endstream position and trim
      // exactly ONE preceding EOL (\r\n, \n, or \r) added by the writer.
      dataEnd = e;
      if (buf[dataEnd - 1] === 0x0a) {
        dataEnd--;
        if (buf[dataEnd - 1] === 0x0d) dataEnd--;
      } else if (buf[dataEnd - 1] === 0x0d) {
        dataEnd--;
      }
    }

    streams.push({ dict, data: buf.subarray(dataStart, dataEnd) });
    idx = e + eKey.length;
  }
  return streams;
}

// Decode a PDF literal string body (already stripped of its surrounding
// parentheses) handling backslash escapes and octal codes.
function decodeLiteral(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\') {
      const n = body[i + 1];
      if (n === undefined) break;
      if (n >= '0' && n <= '7') {
        // up to 3 octal digits
        let oct = n;
        let j = i + 2;
        while (j < body.length && oct.length < 3 && body[j] >= '0' && body[j] <= '7') {
          oct += body[j];
          j++;
        }
        out += String.fromCharCode(parseInt(oct, 8));
        i = j - 1;
      } else {
        const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        if (n === '\n') { /* line continuation */ }
        else out += map[n] !== undefined ? map[n] : n;
        i += 1;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

// Decode a PDF hex string <...> (content between the angle brackets).
function decodeHex(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
  }
  if (clean.length % 2) out += String.fromCharCode(parseInt(clean[clean.length - 1] + '0', 16));
  return out;
}

// Pull text out of a decoded content stream by scanning for text-showing
// operators: (string) Tj, [..] TJ, (string) ', (string) ".
function textFromContent(content) {
  let out = '';
  let i = 0;
  const n = content.length;

  const readLiteral = (start) => {
    // start points at '('. Return [text, indexAfterClosingParen]
    let depth = 0;
    let j = start;
    let body = '';
    for (; j < n; j++) {
      const c = content[j];
      if (c === '\\') { body += c + (content[j + 1] || ''); j++; continue; }
      if (c === '(') { if (depth > 0) body += c; depth++; continue; }
      if (c === ')') { depth--; if (depth === 0) { return [body, j + 1]; } body += c; continue; }
      if (depth > 0) body += c;
    }
    return [body, j];
  };

  while (i < n) {
    const c = content[i];
    if (c === '(') {
      const [body, next] = readLiteral(i);
      // Determine the operator following the string (skip spaces).
      let k = next;
      while (k < n && /\s/.test(content[k])) k++;
      const op2 = content.substr(k, 2);
      const op1 = content[k];
      out += decodeLiteral(body);
      if (op1 === "'" || op2 === '"') out += '\n';
      i = next;
      continue;
    }
    if (c === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      if (end !== -1) {
        out += decodeHex(content.substring(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    if (c === '[') {
      // TJ array: concatenate strings, treat large negative numbers as spaces.
      const end = content.indexOf(']', i);
      if (end !== -1) {
        out += parseTJArray(content.substring(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    // Detect "Td"/"TD"/"T*" line moves to insert spacing/newlines.
    if ((c === 'T') && (content[i + 1] === '*')) { out += '\n'; i += 2; continue; }
    i++;
  }
  return out;
}

// Parse a TJ array body into text. Numbers with large magnitude denote spacing.
function parseTJArray(arr) {
  let out = '';
  let i = 0;
  const n = arr.length;
  while (i < n) {
    const c = arr[i];
    if (c === '(') {
      let depth = 0, j = i, body = '';
      for (; j < n; j++) {
        const ch = arr[j];
        if (ch === '\\') { body += ch + (arr[j + 1] || ''); j++; continue; }
        if (ch === '(') { if (depth > 0) body += ch; depth++; continue; }
        if (ch === ')') { depth--; if (depth === 0) break; body += ch; continue; }
        if (depth > 0) body += ch;
      }
      out += decodeLiteral(body);
      i = j + 1;
      continue;
    }
    if (c === '<') {
      const end = arr.indexOf('>', i);
      if (end !== -1) { out += decodeHex(arr.substring(i + 1, end)); i = end + 1; continue; }
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i;
      while (j < n && /[-0-9.]/.test(arr[j])) j++;
      const num = parseFloat(arr.substring(i, j));
      if (!Number.isNaN(num) && num <= -100) out += ' '; // kerning gap -> space
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

// Collapse excessive whitespace while keeping paragraph breaks.
function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// --- public API ------------------------------------------------------------

/**
 * Extract text from a PDF Buffer.
 * @param {Buffer} buf
 * @returns {{ text: string, chars: number, extractable: boolean, warning?: string }}
 */
export function extractPdfText(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('PDF_INPUT_NOT_BUFFER');
  if (buf.length > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('NOT_A_PDF');
  }

  const streams = extractStreams(buf);
  let combined = '';

  for (const { dict, data } of streams) {
    let content = null;
    if (/FlateDecode/.test(dict)) {
      const inflated = tryInflate(data);
      if (inflated) content = inflated.toString('latin1');
    } else if (!/\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|Image)/.test(dict)) {
      // Uncompressed content stream (not an image).
      content = data.toString('latin1');
    }
    if (!content) continue;
    // Only mine streams that look like content (contain text operators).
    if (/\b(Tj|TJ|Td|TD|BT)\b/.test(content) || content.includes('(')) {
      combined += textFromContent(content) + '\n';
    }
  }

  const text = tidy(combined);
  const chars = text.length;
  const extractable = chars >= 8; // a few chars at least

  const result = { text, chars, extractable };
  if (!extractable) {
    result.warning =
      'Bu PDF dan matn ajratib bolmadi. U skaner qilingan (rasm) hujjat yoki ' +
      'maxsus shriftdan foydalangan bolishi mumkin.';
  }
  return result;
}
