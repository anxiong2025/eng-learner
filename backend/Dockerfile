# Build stage
FROM rust:latest as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# Copy actual source code
COPY src ./src

# Build the application
RUN touch src/main.rs && cargo build --release

# Runtime stage - must match GLIBC version from rust:latest (Debian Trixie)
FROM debian:trixie-slim

WORKDIR /app

# Install runtime dependencies including yt-dlp for YouTube video parsing
# Node.js is required as JavaScript runtime for yt-dlp to decrypt YouTube signatures
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    python3 \
    python3-pip \
    ffmpeg \
    nodejs \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    && node --version

# Copy the binary
COPY --from=builder /app/target/release/eng-learner-backend .

# Expose port
EXPOSE 3001

# Set environment variables
ENV RUST_LOG=info

# Run the binary
CMD ["./eng-learner-backend"]
