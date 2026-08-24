FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/client/package.json packages/client/tsconfig.json ./packages/client/
RUN npm ci
COPY apps/api/src ./apps/api/src
COPY apps/dashboard ./apps/dashboard
COPY packages/client/src ./packages/client/src
COPY scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
USER node
COPY --from=build --chown=node:node /workspace/package.json /workspace/package-lock.json ./
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/dashboard ./apps/dashboard
COPY --from=build --chown=node:node /workspace/scripts ./scripts
EXPOSE 8080
CMD ["npm", "run", "start", "--workspace", "@kurubase/api"]
