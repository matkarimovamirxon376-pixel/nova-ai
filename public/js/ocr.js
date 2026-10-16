// OCR + PDF rasterization for scanned (image-based) PDFs.
//
// Strategy, in order of preference, decided by chooseStrategy():
//   1. "none"   — the PDF already has extractable text; OCR not needed.
//   2. "ocr"    — run Tesseract.js in the browser (free, open-source, local).
//   3. "vision" — send rendered page images to the backend /api/vision
//                 endpoint (secure, server-side keys) when a vision provider
//                 is configured.
//
// IMPORTANT (honesty): Tesseract.js and PDF.js are loaded on demand from a
// CDN (or a self-hosted copy — see OCR_ASSET config). They are NOT bundled as
// npm dependencies, so no `npm install` is required. If the browser cannot
// reach the assets, OCR degrades gracefully and the UI says so. This module
// never fabricates OCR text.

// --- Asset locations (overridable by the host page) ------------------------
// To self-host (recommended for offline/air-gapped use), download these files
// and point these URLs at your own /vendor/ paths.
const ASSETS = {
  // PDF.js (ES module build) for rendering PDF pages to canvas.
  pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
  pdfjsWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs',
  // Tesseract.js (UMD build) for OCR.
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};

// Allow the page / a global to override asset URLs (e.g. for self-hosting).
if (typeof window !== 'undefined' && window.NOVA_OCR_ASSETS) {
  Object.assign(ASSETS, window.NOVA_OCR_ASSETS);
}

let _pdfjs = null;
let _tesseractLoaded = false;

// --- Capability detection --------------------------------------------------

export function browserCanRasterize() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Decide how a scanned PDF should be handled.
 * @param {object} opts
 * @param {boolean} opts.extractable  did text extraction already succeed?
 * @param {boolean} opts.visionAvailable  is a vision provider configured?
 * @param {boolean} opts.ocrEnabled   has the user allowed client OCR?
 * @returns {'none'|'ocr'|'vision'|'unavailable'}
 */
export function chooseStrategy({ extractable, visionAvailable, ocrEnabled }) {
  if (extractable) return 'none';
  if (ocrEnabled) return 'ocr';
  if (visionAvailable) return 'vision';
  return 'unavailable';
}

// --- Dynamic loaders -------------------------------------------------------

async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  // Dynamic import of an ES module from a URL. Throws if unreachable.
  const mod = await import(/* @vite-ignore */ ASSETS.pdfjs);
  const pdfjs = mod.default || mod;
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = ASSETS.pdfjsWorker;
  } catch {
    /* some builds expose it differently; rendering still works single-threaded */
  }
  _pdfjs = pdfjs;
  return pdfjs;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('SCRIPT_LOAD_FAILED'));
    document.head.appendChild(s);
  });
}

async function loadTesseract() {
  if (_tesseractLoaded && window.Tesseract) return window.Tesseract;
  await loadScript(ASSETS.tesseract);
  if (!window.Tesseract) throw new Error('TESSERACT_UNAVAILABLE');
  _tesseractLoaded = true;
  return window.Tesseract;
}

// --- PDF rendering ---------------------------------------------------------

/**
 * Render each page of a PDF (given as base64) to a PNG data URL.
 * @param {string} base64
 * @param {object} opts { scale, maxPages, onProgress(pageIndex, total) }
 * @returns {Promise<string[]>} array of data URLs
 */
export async function renderPdfToImages(base64, { scale = 2, maxPages = 10, onProgress } = {}) {
  const pdfjs = await loadPdfjs();
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const images = [];
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/png'));
    onProgress && onProgress(i, total);
  }
  return images;
}

// --- OCR -------------------------------------------------------------------

/**
 * OCR an array of image data URLs with Tesseract.js.
 * @param {string[]} images
 * @param {object} opts { langs, onProgress({page,total,status,progress}) }
 * @returns {Promise<string>} concatenated recognised text
 */
export async function ocrImages(images, { langs = 'eng+rus', onProgress } = {}) {
  const Tesseract = await loadTesseract();
  let out = '';
  const total = images.length;
  // A single worker reused across pages is more efficient.
  const worker = await Tesseract.createWorker(langs, 1, {
    logger: (m) => {
      if (onProgress && m.status) {
        onProgress({ status: m.status, progress: m.progress || 0 });
      }
    },
  });
  try {
    for (let i = 0; i < total; i++) {
      onProgress && onProgress({ page: i + 1, total, status: 'recognizing', progress: 0 });
      const { data } = await worker.recognize(images[i]);
      out += (data.text || '').trim() + '\n\n';
    }
  } finally {
    await worker.terminate();
  }
  return out.trim();
}

/**
 * Full pipeline for a scanned PDF using client-side OCR.
 * @param {string} base64
 * @param {object} opts progress callbacks + limits
 * @returns {Promise<{text:string, pages:number, engine:'tesseract'}>}
 */
export async function ocrPdf(base64, opts = {}) {
  const { onStage } = opts;
  onStage && onStage('rendering');
  const images = await renderPdfToImages(base64, {
    scale: opts.scale || 2,
    maxPages: opts.maxPages || 10,
    onProgress: (p, t) => onStage && onStage('rendering', { page: p, total: t }),
  });
  onStage && onStage('ocr');
  const text = await ocrImages(images, {
    langs: opts.langs || 'eng+rus',
    onProgress: (info) => onStage && onStage('ocr', info),
  });
  return { text, pages: images.length, engine: 'tesseract' };
}

/**
 * Full pipeline for a scanned PDF using the secure backend vision endpoint.
 * Renders pages to images (needs PDF.js) and sends each to /api/vision.
 * @param {string} base64
 * @param {object} opts { prompt, onStage, maxPages }
 * @returns {Promise<{text:string, pages:number, engine:'vision'}>}
 */
export async function visionPdf(base64, { prompt, onStage, maxPages = 5 } = {}) {
  onStage && onStage('rendering');
  const images = await renderPdfToImages(base64, {
    scale: 2,
    maxPages,
    onProgress: (p, t) => onStage && onStage('rendering', { page: p, total: t }),
  });
  onStage && onStage('vision');
  let out = '';
  for (let i = 0; i < images.length; i++) {
    onStage && onStage('vision', { page: i + 1, total: images.length });
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataUrl: images[i],
        prompt:
          prompt ||
          'Ushbu skaner qilingan hujjat sahifasidagi barcha matnni ozgartirishsiz kochirib yozing.',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || 'VISION_ERROR');
      err.code = data.error || 'VISION_ERROR';
      throw err;
    }
    out += (data.text || '').trim() + '\n\n';
  }
  return { text: out.trim(), pages: images.length, engine: 'vision' };
}
