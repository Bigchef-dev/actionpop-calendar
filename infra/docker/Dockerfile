FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @actionpop/core build && pnpm --filter @actionpop/api build && pnpm --filter @actionpop/worker build

FROM node:20-alpine AS runtime-base
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S actionpop && adduser -S actionpop -G actionpop
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/dist packages/core/dist

FROM runtime-base AS api
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
RUN pnpm install --prod --frozen-lockfile
USER actionpop
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM runtime-base AS worker
COPY --from=build /app/apps/worker/package.json apps/worker/package.json
COPY --from=build /app/apps/worker/dist apps/worker/dist
RUN pnpm install --prod --frozen-lockfile
USER actionpop
CMD ["node", "apps/worker/dist/main.js"]