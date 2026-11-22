FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

# npm may silently skip optional native packages after a registry timeout.
# Keep the Linux build binaries required by the locked Vite/Tailwind toolchain explicit.
RUN npm install --no-save --package-lock=false \
    lightningcss-linux-x64-musl@1.32.0 \
    @tailwindcss/oxide-linux-x64-musl@4.3.0 \
    @rollup/rollup-linux-x64-musl@4.61.1 \
    @esbuild/linux-x64@0.25.12

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/uploads

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/uploads \
    && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/server.mjs"]
