FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

USER node
EXPOSE 5111
CMD ["node", "server.js"]
