FROM node:22-alpine

WORKDIR /app

# Optimisation du cache Docker : on copie d'abord les fichiers de dépendances
COPY flaynn-api/package*.json ./flaynn-api/

# Installation des dépendances
WORKDIR /app/flaynn-api
RUN npm ci --omit=dev

# On copie ensuite le reste du code backend et le dossier public
WORKDIR /app
COPY flaynn-api ./flaynn-api
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Lancement de l'API depuis son dossier
WORKDIR /app/flaynn-api
CMD ["node", "index.js"]