FROM node:22.23-alpine
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev

WORKDIR /app
COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm ci

COPY . .

CMD ["node", "index.js"]
