FROM node:18-bullseye-slim

# Install system dependencies required for canvas and other native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy source code
COPY . .

# Environment variables for production overrides
ENV NODE_ENV=production
ENV DB_PATH=/data/database.db
ENV SESSION_PATH=/data/sessions

# Expose backend port
EXPOSE 3000

# Start the unified backend server
CMD ["node", "backend/server.js"]
