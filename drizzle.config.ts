import type { Config } from 'drizzle-kit';
import { DATABASE_CONFIG } from './src/config';

export default {
    schema: './src/db/schema.ts',
    out: './drizzle',
    driver: 'pg',
    dbCredentials: {
        host: DATABASE_CONFIG.host,
        user: DATABASE_CONFIG.user,
        password: DATABASE_CONFIG.password,
        database: DATABASE_CONFIG.database,
    },
} satisfies Config;
