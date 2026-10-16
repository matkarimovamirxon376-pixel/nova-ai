// Diagnostic: reports whether a real AI provider is configured and reachable.
// Does NOT fake anything — it performs a minimal live call to the configured
// provider and tells you the truth. Reads config the same way the server does,
// so it honours your .env.
//
// Usage:  node scripts/check-ai.mjs      (or: npm run check:ai)

import { config, isAiConnected, isVisionAvailable } from '../server/config.js';

console.log('NOVA AI — provider diagnostic\n');
console.log('  AI_PROVIDER:     ', config.aiProvider);
if (config.effectiveProvider !== config.aiProvider) {
  console.log('  (adapter):       ', config.effectiveProvider, '(OpenAI-compatible)');
}
console.log('  aiConnected:     ', isAiConnected());
console.log('  visionAvailable: ', isVisionAvailable());

if (config.aiProvider === 'none' || !isAiConnected()) {
  console.log(
    '\n  Natija: AI provayder sozlanmagan. Ilova "ULANMAGAN" rejimida ishlaydi\n' +
      '  va hech qanday soxta javob bermaydi. Ulash uchun .env faylini sozlang\n' +
      '  (README: "Connecting a real AI provider"). Bepul variant: Ollama.\n'
  );
  process.exit(0);
}

// Attempt a tiny real call so you know it actually works end to end.
console.log('\n  Jonli test sorovi yuborilmoqda…');
try {
  const { generate } = await import('../server/ai-provider.js');
  const text = await generate({ task: 'chat', prompt: "Qisqa qilib 'tayyor' deb javob ber." });
  console.log('  Natija: ULANDI ✓');
  console.log('  Model javobi (qisqartirilgan):', JSON.stringify((text || '').slice(0, 120)));
  process.exit(0);
} catch (e) {
  console.log('  Natija: Provayder sozlangan, lekin sorov muvaffaqiyatsiz tugadi ✗');
  console.log('  Xato:', e.message || e.code || String(e));
  console.log(
    '\n  Maslahat: model nomi togriligini, kalit/endpoint ni va tarmoq ulanishini\n' +
      '  tekshiring. Ollama uchun: `ollama serve` ishga tushganini va model\n' +
      '  yuklanganini (`ollama pull llama3.1`) tekshiring.'
  );
  process.exit(1);
}
