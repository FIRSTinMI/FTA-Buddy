import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export let db: NodePgDatabase<typeof schema>;

export function connect() {
	console.log("Initializing database connection");
	const pool = new Pool({
		user: process.env.DB_USER,
		host: process.env.DB_HOST,
		database: process.env.DB_NAME,
		password: process.env.DB_PASSWORD,
		port: parseInt(process.env.DB_PORT ?? "5432"),
		max: 10,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 5_000,
	});

	pool.on("error", (err) => console.error("Unexpected DB pool error:", err));
	db = drizzle(pool, { schema });
	console.log("Connected to database (pool)");
	return Promise.resolve();
}
