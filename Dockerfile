FROM python:3.11-slim

# Avoid apt prompts and ensure UTF-8
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PORT=7860

# Install basic tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create user with UID 1000 required by Hugging Face Spaces
RUN useradd -m -u 1000 user

WORKDIR /app

# Install Python requirements
COPY --chown=user:user Backend/requirements.txt /app/Backend/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /app/Backend/requirements.txt

# Copy entire application with user ownership so SQLite is writable
COPY --chown=user:user . /app

# Switch to non-root user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

EXPOSE 7860

# Run Chatwoot Smart Router Backend
CMD ["python", "Backend/app.py"]
