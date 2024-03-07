import type { Config } from 'drizzle-kit';

export default {
    schema: './src/db/schema.ts',
    out: './drizzle',
    driver: 'pg',
    dbCredentials: {
        host: process.env.DB_HOST ?? 'localhost',
        user: process.env.DB_USER ?? '',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_DATABASE ?? '',
    },
} satisfies Config;
