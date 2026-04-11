FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
COPY app/package.json app/bun.lock* ./app/
COPY extension/package.json ./extension/
COPY userscript/package.json ./userscript/
RUN bun install --frozen-lockfile
RUN cd app && bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app .

CMD ["bun", "run", "start"]
