# NOVA AI — Docker image.
# Loyiha zero-dependency (hech qanday npm paket o'rnatilmaydi), shuning uchun
# image juda yengil va tez quriladi. Render, Railway, Fly.io va boshqa
# Docker'ni qo'llab-quvvatlovchi bepul/arzon platformalarda ishlaydi.

FROM node:20-alpine

WORKDIR /app

# Avval package.json ni nusxalaymiz (kesh uchun). Lock fayli yo'q — bu normal,
# chunki loyihada tashqi paketlar yo'q.
COPY package.json ./

# Dependency bo'lmasa ham xavfsiz; bo'lsa o'rnatadi.
RUN npm install --omit=dev || true

# Qolgan barcha fayllarni nusxalaymiz.
COPY . .

# API kaliti IMAGE ichiga YOZILMAYDI. U ishga tushganda muhit o'zgaruvchisi
# sifatida beriladi (Render/Railway panelidan yoki `docker run -e`).
#
# MUHIM: PORT ni bu yerda QATTIQ belgilamaymiz. Render (va boshqa hostlar)
# serverga o'z PORT raqamini muhit o'zgaruvchisi orqali beradi; server uni
# avtomatik o'qiydi (config.js: process.env.PORT). Agar bu yerda ENV PORT=3000
# qilsak, host bergan portni bosib ketadi va server noto'g'ri portda ishga
# tushib, host ulana olmaydi (SIGTERM bilan to'xtaydi).
ENV HOST=0.0.0.0
# Render PORT ni muhit o'zgaruvchisi orqali beradi (render.yaml da 10000).
# EXPOSE faqat hujjat uchun; server haqiqiy portni process.env.PORT dan oladi.
EXPOSE 10000

CMD ["npm", "start"]
