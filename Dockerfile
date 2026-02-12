FROM node:20-slim

# Install Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 libxshmfence1 \
    fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install ALL deps (including Playwright)
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
RUN npm ci
RUN cd client && npm install

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Ensure data directory exists
RUN mkdir -p /app/data/csv

EXPOSE 3001

CMD ["npm", "start"]
