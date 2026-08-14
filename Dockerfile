FROM oven/bun:1 AS builder
# Point installs at a registry supplied at build time; defaults to public npmjs so
# this is a no-op anywhere else. On the NAS build server, Coolify sets NPM_REGISTRY
# to the local Verdaccio cache (http://192.168.1.2:4873/) so bun installs are cached
# and survive transient npmjs tarball failures.
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV BUN_CONFIG_REGISTRY=${NPM_REGISTRY}
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
WORKDIR /app

COPY package.json bun.lock* ./
COPY app/package.json app/bun.lock* ./app/
COPY extension/package.json ./extension/
RUN bun install --frozen-lockfile
RUN cd app && bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app .

CMD ["bun", "run", "start"]
