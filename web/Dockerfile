# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Bake placeholders so they end up in the JS bundles
ENV NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL__
ENV NEXT_PUBLIC_WS_URL=__NEXT_PUBLIC_WS_URL__

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Standalone includes server + trimmed node_modules
COPY --from=build /app/.next/standalone/ ./
# Standalone omits these — must copy separately
COPY --from=build /app/.next/static/ .next/static/
COPY --from=build /app/public/ public/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN addgroup -S asc && adduser -S asc -G asc
USER asc
LABEL org.opencontainers.image.source="https://github.com/maml/asc"
LABEL org.opencontainers.image.licenses="FSL-1.1-MIT"
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
