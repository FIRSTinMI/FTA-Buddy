import { Pool } from "pg";

/**
 * Dev-only bridges to the PRODUCTION instance. These exist solely so the dev
 * instance can (read-only) pull a real event's data and relay live field data
 * from prod. Nothing here ever WRITES to prod: the dev tools are strictly
 * one-way so they can never affect the production event.
 *
 * Gated by {@link isDevMode}. On the prod instance PROD_* env is unset and the
 * pools are never constructed.
 */

/** True only on the isolated dev instance (its own Firebase project + NODE_ENV). */
export function isDevMode(): boolean {
	return process.env.FIREBASE_PROJECT_ID === "fta-buddy-dev" || process.env.NODE_ENV === "dev";
}

let _prodPool: Pool | null = null;
/** Read-only connection to the PRODUCTION Postgres (for copy-event). */
export function prodPool(): Pool {
	if (!_prodPool) {
		if (!process.env.PROD_DB_HOST) throw new Error("PROD_DB_HOST not configured on this instance");
		_prodPool = new Pool({
			host: process.env.PROD_DB_HOST,
			port: Number(process.env.PROD_DB_PORT ?? 5432),
			database: process.env.PROD_DB_NAME,
			user: process.env.PROD_DB_USER,
			password: process.env.PROD_DB_PASSWORD,
			max: 3,
		});
	}
	return _prodPool;
}

let _devPool: Pool | null = null;
/** Direct pool to THIS (dev) instance's Postgres, for the generic copy writer. */
export function devPool(): Pool {
	if (!_devPool) {
		_devPool = new Pool({
			host: process.env.DB_HOST,
			port: Number(process.env.DB_PORT ?? 5432),
			database: process.env.DB_NAME,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			max: 4,
		});
	}
	return _devPool;
}
