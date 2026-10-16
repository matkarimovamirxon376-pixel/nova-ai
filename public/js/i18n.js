// Uzbek (Latin) interface strings. The whole UI is Uzbek by default.
// Centralised here so additional languages can be added later.

export const uz = {
  newChat: 'Yangi suhbat',
  tools: 'Vositalar',
  history: 'Tarix',
  settings: 'Sozlamalar',
  close: 'Yopish',
  clear_data: 'Barcha tarixni ochirish',

  t_chat: 'Suhbat',
  t_translate: 'Tarjima',
  t_essay: 'Insho / Hisobot',
  t_english: 'Ingliz tili',
  t_math: 'Matematika',
  t_document: 'Hujjat tahlili',
  t_image: 'Rasm tahlili',

  welcome_sub: 'Ozbek tilidagi aqlli yordamchingiz',
  composer_ph: 'Xabar yozing…',
  composer_hint: "NOVA AI xatolarga yol qoyishi mumkin. Muhim ma'lumotlarni tekshiring.",

  status_checking: 'Tekshirilmoqda…',
  status_connected: 'AI ulangan',
  status_offline: 'AI ulanmagan',
  vision_ready: 'rasm tahlili tayyor',

  setting_theme: 'Mavzu',
  theme_dark: 'Tungi',
  theme_light: 'Kunduzgi',
  setting_tts: 'Matnni ovozga aylantirish (TTS)',
  setting_voice: 'Ovoz (TTS)',
  setting_ocr: 'Skaner qilingan PDF uchun OCR',
  setting_ocr_hint:
    "Yoqilganda, matnsiz (skaner qilingan) PDF lar brauzerda OCR orqali o'qiladi. " +
    "Birinchi marta ishlatishda OCR dvigateli (Tesseract.js) internetdan yuklab olinadi. " +
    "Agar o'chirilgan bo'lsa va server tomonida vision model sozlangan bo'lsa, " +
    "o'rniga xavfsiz vision tahlili ishlatiladi.",
  setting_about: 'Dastur haqida',

  send: 'Yuborish',
  copy: 'Nusxalash',
  speak: 'Ovozda oqish',
  copied: 'Nusxalandi',
  stopped: 'Toxtatildi',
  listening: 'Tinglayapman…',
  mic_unsupported: 'Brauzeringiz ovozli kiritishni qollab-quvvatlamaydi.',
  tts_unsupported: 'Brauzeringiz ovoz chiqarishni qollab-quvvatlamaydi.',

  ai_not_connected_title: 'AI xizmati ulanmagan',
  vision_not_available_title: 'Rasm tahlili mavjud emas',
  thinking: 'oylayapman…',
  error_generic: 'Xatolik yuz berdi. Qaytadan urinib koring.',
  empty_history: 'Hali suhbatlar yoq',
  confirm_clear: 'Barcha suhbatlar tarixini ochirishni tasdiqlaysizmi?',
  file_too_big: 'Fayl juda katta (maksimal 8 MB).',
  attached: 'biriktirildi',

  // PDF / attachment states
  pdf_extracting: 'ochilmoqda…',
  pdf_error: 'PDF oqishda xatolik',
  pdf_no_text: 'matn topilmadi',
  pdf_still_processing: 'PDF hali ochilmoqda, biroz kuting…',
  chars: 'belgi',

  // Scanned PDF / OCR states
  pdf_scanned: 'skaner qilingan',
  ocr_rendering: 'sahifalar tayyorlanmoqda',
  ocr_running: 'OCR ishlamoqda',
  ocr_vision: 'vision tahlili',
  ocr_page: 'sahifa',
  ocr_done: 'OCR tugadi',
  ocr_text_found: 'OCR orqali matn topildi',
  ocr_no_result: 'OCR natija bermadi',
  ocr_assets_failed:
    "OCR dvigeteli yuklab bolinmadi (internet yoki CDN mavjud emas). " +
    "Oflayn ishlatish uchun Tesseract.js va PDF.js ni oz serveringizga joylang (README).",
  ocr_vision_unavailable:
    "Skaner qilingan PDF: OCR ochirilgan va vision model sozlanmagan. " +
    "Sozlamalardan OCR ni yoqing yoki server tomonida vision modelni ulang.",
  ocr_disabled_notice:
    "Bu PDF skaner qilingan korinadi (matnsiz). OCR ni Sozlamalardan yoqing " +
    "yoki server tomonida vision modelni ulang.",

  about_text:
    "NOVA AI — ozbek tili uchun mo'ljallangan sun'iy intellekt yordamchisi. " +
    "Barcha ma'lumotlar brauzeringizda saqlanadi. AI javoblari faqat server " +
    "tomonida haqiqiy AI provayder ulangandan keyin ishlaydi.",

  // Per-tool placeholder hints shown in the composer.
  ph: {
    chat: 'Xabar yozing…',
    translate: 'Tarjima qilish uchun matn kiriting…',
    essay: 'Insho yoki hisobot mavzusini yozing…',
    english: 'Ingliz tili boyicha savolingizni yozing…',
    math: 'Matematik masalani kiriting…',
    document: 'Hujjatni biriktiring va savol bering…',
    image: 'Rasmni biriktiring va savol bering…',
  },

  // Welcome-screen suggestion cards per tool.
  suggestions: {
    chat: [
      { t: "Reja tuzish", d: "Haftalik ish rejamni tuzishga yordam ber" },
      { t: "G'oya", d: "Startap uchun 5 ta g'oya ayt" },
      { t: "Maslahat", d: "Vaqtni to'g'ri taqsimlash bo'yicha maslahat ber" },
      { t: "Tushuntir", d: "Kvant kompyuterlarni oddiy tilda tushuntir" },
    ],
    translate: [
      { t: "Ingliz tiliga", d: "Bu matnni ingliz tiliga tarjima qil" },
      { t: "Rus tiliga", d: "Bu gaplarni rus tiliga tarjima qil" },
      { t: "O'zbek tiliga", d: "Ingliz matnini o'zbek tiliga o'gir" },
      { t: "Rasmiy uslub", d: "Bu xatni rasmiy uslubda tarjima qil" },
    ],
    essay: [
      { t: "Insho", d: "Vatan haqida 300 so'zli insho yoz" },
      { t: "Hisobot", d: "Loyiha yakuni bo'yicha hisobot tuz" },
      { t: "Maqola", d: "Sog'lom turmush tarzi haqida maqola yoz" },
      { t: "Ariza", d: "Ta'tilga chiqish uchun ariza yoz" },
    ],
    english: [
      { t: "Grammatika", d: "Present Perfect zamonini tushuntir" },
      { t: "So'zlar", d: "Kundalik 10 ta foydali ibora ber" },
      { t: "Mashq", d: "Darajamni tekshirish uchun test ber" },
      { t: "Dialog", d: "Do'konda suhbat dialogini yoz" },
    ],
    math: [
      { t: "Tenglama", d: "2x + 5 = 15 tenglamani yech" },
      { t: "Geometriya", d: "Uchburchak yuzini topish formulasi" },
      { t: "Foiz", d: "250 ning 18 foizini hisobla" },
      { t: "Tushuntir", d: "Pifagor teoremasini tushuntir" },
    ],
    document: [
      { t: "Xulosa", d: "Hujjatni biriktiring — qisqa xulosa chiqaraman" },
      { t: "Asosiy fikr", d: "Matndan asosiy fikrlarni ajrataman" },
      { t: "Savol", d: "Hujjat bo'yicha savollaringizga javob beraman" },
      { t: "Tahlil", d: "Hujjat tuzilishini tahlil qilaman" },
    ],
    image: [
      { t: "Tavsif", d: "Rasmni biriktiring — tasvirlab beraman" },
      { t: "Matn", d: "Rasmdagi matnni o'qiб beraman" },
      { t: "Tahlil", d: "Rasm mazmunini tahlil qilaman" },
      { t: "Savol", d: "Rasm bo'yicha savollarga javob beraman" },
    ],
  },

  toolTitles: {
    chat: 'Suhbat',
    translate: 'Tarjima',
    essay: 'Insho / Hisobot',
    english: 'Ingliz tili',
    math: 'Matematika',
    document: 'Hujjat tahlili',
    image: 'Rasm tahlili',
  },
};

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (uz[key]) el.textContent = uz[key];
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const key = el.getAttribute('data-i18n-ph');
    if (uz[key]) el.setAttribute('placeholder', uz[key]);
  });
}
