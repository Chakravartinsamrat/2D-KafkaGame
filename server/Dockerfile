# ─────────────────────────────────────────────────────────────────────────────
# 2D Kafka Game - Backend Dockerfile
# Multi-stage build for smaller image size
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build dependencies
FROM python:3.11-slim as builder

WORKDIR /app

# Install poetry (1.8+ required for package-mode)
RUN pip install --no-cache-dir poetry==1.8.5

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Export dependencies to requirements.txt (without dev dependencies)
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes --without dev

# Stage 2: Production image
FROM python:3.11-slim

WORKDIR /app

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser

# Install dependencies
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY services/ ./services/

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
