FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY tsconfig*.json nest-cli.json ./
COPY apps ./apps
COPY libs ./libs

RUN pnpm install --no-frozen-lockfile
RUN pnpm prisma:generate

# اگر اسم پروژه‌ها api/worker نبود، این خط کمک می‌کنه بفهمیم
RUN echo "==== nest-cli.json ====" && cat nest-cli.json

RUN pnpm exec nest build api
RUN pnpm exec nest build worker

RUN test -d dist/apps/api
RUN test -d dist/apps/worker
RUN find dist/apps/api -type f -name main.js | head -n 1 | grep -q .
RUN find dist/apps/worker -type f -name main.js | head -n 1 | grep -q .

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

COPY start.sh ./start.sh
COPY scripts ./scripts
RUN chmod +x ./start.sh ./scripts/*.sh

EXPOSE 3000
CMD ["./start.sh"]
