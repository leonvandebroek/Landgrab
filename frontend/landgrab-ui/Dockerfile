FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
WORKDIR /usr/share/nginx/html

# Make PID file, cache, and temp dirs writable by the nginx user (uid 101)
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

COPY --from=build --chown=nginx:nginx /app/dist .
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Drop to non-root
USER nginx
EXPOSE 8080
