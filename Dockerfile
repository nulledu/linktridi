# Imagem do SERVIDOR DOS CHATS (player do TridiFlow), pra rodar no Easypanel.
# Usa o build "standalone" do Next: a imagem final leva só o necessário pra
# servir — sem código-fonte, sem devDependencies.
#
# Este container roda com APENAS_PLAYER=1 + PLAYER_API_BASE, então NÃO precisa
# (nem deve receber) nenhuma chave do Supabase ou da Meta.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Liga o output standalone só aqui (na Vercel o build segue como sempre).
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Não roda como root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
