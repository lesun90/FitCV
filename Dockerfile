FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV FITCV_HOST=0.0.0.0
ENV FITCV_PORT=5173
ENV FITCV_USE_POLLING=true

EXPOSE 5173

CMD ["npm", "run", "dev"]
