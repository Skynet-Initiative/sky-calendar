FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/react-calendar/package.json packages/react-calendar/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:calendar && bun run build:frontend

FROM oven/bun:1.3.14-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
USER bun
EXPOSE 3010
CMD ["bun", "apps/frontend/server.js"]
