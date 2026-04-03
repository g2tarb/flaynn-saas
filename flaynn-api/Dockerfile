FROM node:22-alpine

WORKDIR /app

# Installation des dépendances uniquement (optimisation du cache Docker)
COPY package*.json ./
RUN npm ci --omit=dev

# Copie du code source API
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]