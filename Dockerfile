FROM node:20-bookworm-slim

# Set environment variables
ENV PORT=8000 \
    RCSA_PYTHON_EXECUTABLE=/opt/venv/bin/python \
    PATH="/opt/venv/bin:$PATH"

# Install Python 3, venv, and build tools for native node modules (better-sqlite3) + curl and wget for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create and activate Python virtual environment
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip

WORKDIR /app

# Copy requirement files first for optimal layer caching
COPY requirements-export.txt requirements-document-extraction.txt ./
RUN /opt/venv/bin/pip install --no-cache-dir \
    -r requirements-export.txt \
    -r requirements-document-extraction.txt

# Copy package manifests and install all Node dependencies (including build tools)
COPY package.json package-lock.json ./
RUN npm install --include=dev

# Copy project source code
COPY . .

# Ensure persistent data directory exists
RUN mkdir -p data

# Build frontend production bundle and server bundle
RUN npm run build

# Set production environment for runtime
ENV NODE_ENV=production

# Expose server ports (both 8000 default for Coolify and 3000 alternative)
EXPOSE 8000 3000

# Robust multi-port IPv4 health check with 40s start grace period and 10 retries
HEALTHCHECK --interval=5s --timeout=5s --start-period=40s --retries=10 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8000}/health || curl -fsS http://127.0.0.1:3000/health || wget -q -O - http://127.0.0.1:${PORT:-8000}/health || exit 1

# Start the fullstack platform with native node
CMD ["node", "dist/server.js"]
