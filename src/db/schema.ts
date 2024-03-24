import { boolean, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core"

export const roleEnum = pgEnum('role', ['ADMIN', 'FTA', 'FTAA', 'CSA', 'RI']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: varchar('username').unique().notNull(),
    email: varchar('email').unique().notNull(),
    password: text('password').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    last_seen: timestamp('last_seen').notNull().defaultNow(),
    events: jsonb('events').notNull().default('[]'),
    role: roleEnum('role').notNull().default('FTA'),
    token: varchar('token').notNull().default(''),
});

export const User = typeof users.$inferInsert;

export const events = pgTable('events', {
    code: varchar('code').primaryKey(),
    pin: varchar('pin').notNull(),
    teams: jsonb('teams').notNull().default('[]'),
    created_at: timestamp('created_at').notNull().defaultNow(),
    token: varchar('token').notNull().default('').unique(),
});

export const Event = typeof events.$inferInsert;

export const messages = pgTable('messages', {
    id: serial('id').primaryKey(),
    message: varchar('message').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    user_id: serial('user_id').references(() => users.id).notNull(),
    team: varchar('team').notNull(),
    event_code: varchar('event_code').references(() => events.code).notNull(),
    thread_id: serial('thread'),
    is_ticket: boolean('is_ticket').notNull().default(false),
    is_open: boolean('is_open').notNull().default(true),
    assigned_to: jsonb('assigned_to').notNull().default('[]'),
    closed_at: timestamp('closed_at')
});

export const Message = typeof messages.$inferInsert;
