FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S sentin && adduser -S sentin -G sentin
COPY --from=build --chown=sentin:sentin /app/.next ./.next
COPY --from=build --chown=sentin:sentin /app/public ./public
COPY --from=build --chown=sentin:sentin /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.mjs ./
USER sentin
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
