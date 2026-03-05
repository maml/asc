# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npx tsc

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist/ dist/
COPY migrations/ migrations/
RUN addgroup -S asc && adduser -S asc -G asc
USER asc
EXPOSE 3100
CMD ["node", "dist/server.js"]
