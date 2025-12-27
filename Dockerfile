FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# ✅ pnpm را مستقیم نصب کن (بدون corepack)
RUN npm i -g pnpm@8.15.9
RUN pnpm --version

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY tsconfig*.json nest-cli.json ./
COPY apps ./apps
COPY libs ./libs

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm build:api && pnpm build:worker
RUN pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY scripts ./scripts
COPY start.sh ./start.sh

RUN chmod +x ./start.sh ./scripts/*.sh

EXPOSE 3000
CMD ["./start.sh"]
