import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        host: process.env.DB_HOST ?? "localhost",
        user: process.env.DB_USER ?? "",
        password: process.env.DB_PASSWORD ?? "",
        database: process.env.DB_DATABASE ?? "",
    }
});
