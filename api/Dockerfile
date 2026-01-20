FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy source files
COPY src ./src
COPY public ./public

# Create screenshots directory
RUN mkdir -p /app/screenshots

EXPOSE 3000

CMD ["node", "src/index.js"]
