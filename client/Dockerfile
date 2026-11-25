# Stage 1: Build Vite bundle
FROM node:22-alpine AS builder
WORKDIR /build

COPY client/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY client/ ./
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# Stage 2: Serve static bundle + API proxy with nginx
FROM nginx:alpine AS runner

COPY --from=builder /build/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
