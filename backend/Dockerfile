FROM node:22-alpine AS builder

WORKDIR /app

ENV TZ=Asia/Kathmandu
ENV ATTENDANCE_TIMEZONE=Asia/Kathmandu

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY src ./src
COPY prisma.config.ts ./

RUN npx prisma generate

FROM node:22-alpine AS production-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Kathmandu
ENV ATTENDANCE_TIMEZONE=Asia/Kathmandu

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma.config.ts ./

RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5000

CMD ["npm", "start"]
