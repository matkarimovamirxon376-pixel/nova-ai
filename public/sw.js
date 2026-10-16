// NOVA AI — Service Worker (PWA).
// Vazifasi:
//   - Ilovani "o'rnatiladigan" qiladi (telefon ekraniga qo'shiladi).
//   - Statik fayllarni (HTML/CSS/JS/ikonka) keshlab, tez va oflayn ochadi.
//   - API so'rovlarini (/api/*) HECH QACHON keshlamaydi — AI javoblari va
//     sog'liq holati doim yangi (tarmoqdan) bo'lishi kerak.

const CACHE = 'nova-ai-v1';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/js/app.js',
  '/js/i18n.js',
  '/js/api.js',
  '/js/storage.js',
  '/js/speech.js',
  '/js/files.js',
  '/js/ocr.js',
];

// O'rnatish: statik qobiqni keshga oladi.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Faollashtirish: eski kesh versiyalarini tozalaydi.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Faqat GET so'rovlar bilan ishlaymiz.
  if (request.method !== 'GET') return;

  // API so'rovlari: doim tarmoqdan, keshlamaymiz (AI javoblari yangi bo'lsin).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Navigatsiya (sahifa ochish): avval tarmoq, bo'lmasa keshdagi index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Statik fayllar: avval kesh, bo'lmasa tarmoq (va keshga qo'shamiz).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        // Faqat muvaffaqiyatli, bir xil manbadan kelgan javoblarni keshlaymiz.
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
