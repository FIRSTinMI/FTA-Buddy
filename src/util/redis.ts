import Redis from "ioredis";

if (!process.env.REDIS_URL) {
	throw new Error("REDIS_URL environment variable is required");
}

// Command + publish connection
export const redis = new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null,
});

// Dedicated subscribe-only connection (ioredis connections in subscribe mode
// cannot issue regular commands, so a separate client is required)
export const redisSub = new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null,
});

redis.on("error", (err) => console.error("[Redis] error:", err));
redisSub.on("error", (err) => console.error("[Redis sub] error:", err));


console.log("Redis connections initialized");
