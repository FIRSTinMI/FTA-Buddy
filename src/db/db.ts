import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

export let db: NodePgDatabase<typeof schema>;
const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT ?? '5432')
});
if (!client) throw new Error("Failed to create database connection");

export function connect() {
    return client.connect().then(() => {
        db = drizzle(client, { schema });
        console.log("Connected to database")
    }).catch(console.error);
}
