FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV BACKEND_URL=http://localhost:8080

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/40-pfi-env.sh
RUN chmod +x /docker-entrypoint.d/40-pfi-env.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
