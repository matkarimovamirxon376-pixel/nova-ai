# NOVA AI

Premium, Uzbek-language AI assistant with a black & purple design.
Mobile-first, responsive, light/dark themes.

Built with **zero runtime dependencies** — a Node.js backend using only the
built-in `http` module, and a vanilla ES-module frontend. No `npm install`,
no build step. This also keeps **all API keys on the server**; the browser
never sees a secret.

> **Honesty about AI:** out of the box `AI_PROVIDER=none`, so the app runs
> fully but clearly tells you *"AI xizmati ulanmagan"* instead of faking
> answers. Connect a real provider (below) to get live responses.

---

## Requirements

- Node.js **18+** (uses the built-in `fetch` and ES modules). Check with `node -v`.

That's it. No packages to install.

## Run it

```bash
cd /projects/sandbox
node server/server.js
```

Then open **http://localhost:3000** in your browser.

Change the port if needed:

```bash
PORT=8080 node server/server.js
```

(You can also run `npm start`, which just calls `node server/server.js`.)

## Open it on your phone (same Wi-Fi)

`npm start` prints a **Network:** URL (e.g. `http://192.168.1.23:3000`). On your
phone (connected to the same Wi-Fi), open that URL in Chrome / Samsung Internet.
The mobile layout (drawer sidebar, single-column cards) engages automatically.
Voice input and text-to-speech use the browser's Web Speech API.

## Lint, diagnostics & tests

All checks are dependency-free.

```bash
npm run lint             # ESLint (flat config) — catches real bugs, no style noise
npm run check:ai         # reports whether an AI provider is configured AND reachable
npm test                 # smoke test: every endpoint, PDF, scanned detection, strategy logic
npm run test:integration # end-to-end AI test against a local mock provider
npm run test:all         # both test suites
```

`npm run check:ai` performs a real minimal call to your configured provider and
tells you the truth — it never fakes a connection.

- **Smoke test** (`scripts/smoke-test.mjs`) — 36 checks covering static serving,
  `/api/health`, `/api/generate`, `/api/pdf` (text + scanned detection),
  `/api/vision`, validation, path-traversal guard, and the OCR strategy selector.
- **Integration test** (`scripts/integration-test.mjs`) — spins up a local
  OpenAI-compatible mock server and proves the full AI path works end-to-end:
  real chat + vision replies round-trip through the backend, and the API key is
  sent only server→provider, **never** to the browser. This verifies the secure
  integration without any paid service or external network.

Both suites end with `ALL PASSED`.

---

## Connecting a real AI provider

Copy the example env file and edit it. **`.env` is git-ignored**, so your key
is never committed and never shipped to the frontend.

```bash
cp .env.example .env
```

Pick **one** provider in `.env`. **Three options are free and need no payment.**
After editing `.env`, verify with `npm run check:ai` (must print `ULANDI ✓`).

### Option A — Groq (FREE tier, no credit card) — fastest to set up
Groq is OpenAI-compatible and very fast. As of 2026 the free tier needs **no
credit card** (verify current limits in your Groq console).
1. Create an account at **https://console.groq.com**.
2. Open **API Keys → Create API Key**, copy it (shown once).
3. In `.env`:
```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=openai/gpt-oss-20b
```
Internally this uses the OpenAI-compatible adapter with Groq's endpoint — no
extra setup needed.

### Option B — Ollama (FREE, fully local, no API key, private)
Nothing leaves your machine. Install Ollama (https://ollama.com), pull a model:
```bash
ollama pull llama3.1
```
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
# For IMAGE analysis, also: ollama pull llava
OLLAMA_VISION_MODEL=llava
```

### Option C — Google Gemini (FREE tier, no credit card)
Create a key at **https://aistudio.google.com/app/apikey**, then:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
GEMINI_VISION_MODEL=gemini-1.5-flash
```
> Note: on Gemini's free tier, prompts/responses may be used to improve
> Google's products — avoid confidential data (or use Ollama / a paid tier).

### Option D — OpenAI (PAID) or any OpenAI-compatible endpoint
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini
```

Restart the server. The status pill in the top bar turns green
(*"AI ulangan"*) and chat produces real answers. Hover the pill to see whether
image analysis (vision) is ready.

**Security:** API keys are read only from `.env` / environment on the server.
They are never sent to the browser and never written to logs. On errors you get
clear codes — `MISSING_KEY`, `INVALID_CREDENTIALS`, `RATE_LIMITED`,
`MODEL_NOT_FOUND`, `NETWORK` — without any secret in the message.

### PDF text extraction — no key needed
PDF text extraction runs **entirely on your server with zero dependencies**
(Node's built-in `zlib`). It works **without any AI key**: upload a PDF and the
extracted text appears and is used as context.

### Scanned / image-based PDFs (OCR)
When a PDF has **no extractable text** (a scan or image), the app detects this
and offers two paths — no npm install, no paid service:

1. **Client-side OCR (free, open-source).** Enable *"Skaner qilingan PDF uchun
   OCR"* in Settings. The app renders the PDF pages with **PDF.js** and reads
   them with **Tesseract.js** right in your browser, with live progress. These
   libraries are loaded on demand from a CDN (not bundled), so the first OCR
   run downloads them. Nothing is sent to any server.
2. **Secure vision fallback.** If OCR is off but a vision provider is
   configured, the app renders each page and sends the image to the backend
   `/api/vision` endpoint (keys stay server-side) to transcribe it.

If neither is available, the app says so honestly and never fabricates text.

> **Self-hosting the OCR assets (offline / air-gapped):** download PDF.js and
> Tesseract.js and set their URLs before the app script, e.g.
> ```html
> <script>window.NOVA_OCR_ASSETS = {
>   pdfjs: '/vendor/pdf.min.mjs',
>   pdfjsWorker: '/vendor/pdf.worker.min.mjs',
>   tesseract: '/vendor/tesseract.min.js'
> };</script>
> ```
> Then OCR works with no external network at all.

> **Tested status (honesty):** detection of scanned vs. text PDFs, the
> OCR/vision **strategy selection**, and the vision transcription **route** are
> covered by automated tests (`scripts/smoke-test.mjs`). The in-browser OCR
> *execution* (Tesseract.js + PDF.js) requires a browser that can load those
> assets; it could **not** be executed inside this sandbox because the sandbox
> blocks all outbound CDNs (`INTEGRATIONS_ONLY`). Run it in a normal browser,
> or self-host the assets, to exercise OCR live.

> **Note on this sandbox:** the development sandbox has restricted outbound
> network access (`INTEGRATIONS_ONLY`), so external AI endpoints and `npm`/`pip`
> registries are blocked here. The free local **Ollama** option, or running on
> your own machine with any of the keys above, will connect successfully.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Uzbek interface | ✅ | Entire UI in Uzbek (Latin). |
| Mobile-first responsive | ✅ | Sidebar collapses to a drawer under 860px. |
| Light / dark themes | ✅ | Toggle in top bar + settings; persisted. |
| AI chat | ✅* | Works once a provider is connected. |
| Conversation history | ✅ | Stored in your browser (localStorage). |
| Translation | ✅* | Dedicated tool with its own system prompt. |
| Essay & report writing | ✅* | Structured Uzbek output. |
| English learning | ✅* | Grammar/vocab explained in Uzbek. |
| Mathematics help | ✅* | Step-by-step solutions. |
| Document upload & analysis | ✅ / ✅* | `.txt .md .csv .json` read client-side. **PDF text extraction works with no key** (server-side, dependency-free); AI analysis of that text needs a provider. |
| Scanned-PDF detection | ✅ | Image-only PDFs are detected (no fake text). Tested. |
| Scanned-PDF OCR (client-side) | ⚙️ | **Implemented** with PDF.js + Tesseract.js (CDN/self-hosted, free). Opt-in in Settings. Browser-executed — not runnable inside this sandbox (CDN blocked); run in a real browser. |
| Scanned-PDF vision fallback | ✅* | Renders pages → `/api/vision` (keys server-side). Needs a vision provider. Route tested. |
| Image upload & analysis | ✅ / ✅* | Upload + preview works always. **Real vision analysis** via `/api/vision` needs a vision-capable provider (gpt-4o / Gemini / Ollama llava). |
| Voice input (speech-to-text) | ✅ | Web Speech API, free. Browser-dependent (best in Chrome). |
| Text-to-speech | ✅ | Web Speech Synthesis, free. Toggle + voice picker in settings. |
| User settings | ✅ | Theme, TTS, voice, **OCR toggle**, clear data. |
| Secure backend / no exposed keys | ✅ | Keys read from env on the server only. |

`*` = fully implemented end-to-end; produces real output only after an AI
provider is configured. `⚙️` = implemented but requires the user's browser to
load CDN/self-hosted assets (not executable inside this sandbox). The app never
fabricates AI, OCR, or vision responses.

---

## Project structure

```
.
├── server/
│   ├── server.js        # zero-dep HTTP server: static files + /api routes
│   ├── config.js        # env loader + config (reads secrets server-side)
│   ├── ai-provider.js   # pluggable adapter: chat + vision (openai|gemini|ollama)
│   └── pdf.js           # dependency-free PDF text extraction (uses zlib)
├── public/
│   ├── index.html       # app shell
│   ├── styles.css       # black & purple theme, mobile-first
│   ├── favicon.svg
│   └── js/
│       ├── app.js       # main controller
│       ├── i18n.js      # Uzbek strings
│       ├── api.js       # calls our own /api/* only
│       ├── storage.js   # history/settings in localStorage
│       ├── speech.js    # voice input + TTS
│       ├── files.js     # client-side file reading + PDF extraction call
│       └── ocr.js       # scanned-PDF: PDF.js render + Tesseract OCR / vision
├── scripts/
│   └── smoke-test.mjs   # dependency-free endpoint tests
├── .env.example         # copy to .env to connect a provider
├── .gitignore           # ignores .env
└── package.json
```

## Security notes

- Secrets live only in `.env` / real environment variables, read in
  `server/config.js`. They are **never** sent to the client — the frontend
  only ever calls our own `/api/*` endpoints.
- The static file server normalises paths and rejects traversal outside
  `public/`.
- Upload size is capped (default 8 MB, `MAX_UPLOAD_BYTES`).
