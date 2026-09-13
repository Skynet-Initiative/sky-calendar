FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/react-calendar/package.json packages/react-calendar/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:contracts && bun run build:backend

FROM oven/bun:1.3.14-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
USER bun
EXPOSE 4010
CMD ["bun", "apps/backend/dist/main.js"]
