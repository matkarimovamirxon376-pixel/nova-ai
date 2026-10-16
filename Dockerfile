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
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
