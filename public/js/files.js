// Client-side file reading for document & image analysis.
//
//  - Text files (.txt .md .csv .json ...) are read as plain text in the browser.
//  - PDFs are read as base64 and sent to the backend /api/pdf endpoint, which
//    extracts the text dependency-free (no third-party service). The extracted
//    text is then used as context like any other document.
//  - Images are read as data URLs: shown as a preview and, for the image tool,
//    sent to the backend /api/vision endpoint for AI analysis.

const TEXT_EXT = ['txt', 'md', 'csv', 'json', 'log', 'xml', 'html'];
const MAX = 8 * 1024 * 1024; // 8 MB, matches server default.

export function isImage(file) {
  return file && file.type && file.type.startsWith('image/');
}

export function isPdf(file) {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return (file.name || '').toLowerCase().endsWith('.pdf');
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read error'));
    r.readAsText(file);
  });
}

export function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read error'));
    r.readAsDataURL(file);
  });
}

// Read a file as a bare base64 string (no data: prefix).
export function readBase64(file) {
  return readDataURL(file).then((url) => {
    const comma = url.indexOf(',');
    return comma === -1 ? url : url.slice(comma + 1);
  });
}

/**
 * Process a file into an attachment object. The returned object always has a
 * `status`: 'ready' | 'processing' | 'error'. For PDFs the text is filled in
 * asynchronously by the caller via extractPdf().
 *
 *   { name, kind: 'text'|'image'|'pdf'|'binary', status, text?, dataUrl?, size, error? }
 */
export async function processFile(file) {
  if (file.size > MAX) throw new Error('TOO_BIG');
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (isImage(file)) {
    const dataUrl = await readDataURL(file);
    return { name: file.name, kind: 'image', dataUrl, size: file.size, status: 'ready' };
  }

  if (isPdf(file)) {
    // Mark as processing; the caller will extract text via the backend.
    const base64 = await readBase64(file);
    return { name: file.name, kind: 'pdf', base64, size: file.size, status: 'processing' };
  }

  if (TEXT_EXT.includes(ext) || (file.type && file.type.startsWith('text/'))) {
    let text = await readTextFile(file);
    if (text.length > 20000) text = text.slice(0, 20000) + '\n…[qisqartirildi]';
    return { name: file.name, kind: 'text', text, size: file.size, status: 'ready' };
  }

  // Unknown binary: honest, no fake parsing.
  return { name: file.name, kind: 'binary', size: file.size, status: 'ready' };
}

/**
 * Send a PDF attachment's base64 to the backend and fill in extracted text.
 * Mutates and returns the attachment with status 'ready' or 'error'.
 */
export async function extractPdf(att) {
  try {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: att.base64, name: att.name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'PDF_ERROR');

    att.text = data.text || '';
    att.chars = data.chars || 0;
    att.extractable = Boolean(data.extractable);
    att.warning = data.warning || '';
    att.status = 'ready';
    // Keep the raw bytes only if we may still need them for OCR / vision on a
    // scanned (non-extractable) PDF. Otherwise free the memory.
    if (att.extractable) delete att.base64;
  } catch (e) {
    att.status = 'error';
    att.error = e.message || 'PDF_ERROR';
  }
  return att;
}
