import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

export let db: NodePgDatabase<typeof schema>;
let client: Client;

export function connect() {
    console.log("Initializing database connection");
    client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT ?? '5432')
    });

    return client.connect().then(() => {
        db = drizzle(client, { schema });
        console.log("Connected to database");
    }).catch((e) => {
        console.error(e);
        setTimeout(() => connect(), 500);
    });
}
