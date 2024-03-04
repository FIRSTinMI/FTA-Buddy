import { boolean, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core"
import e from "express";

export const roleEnum = pgEnum('role', ['ADMIN', 'FTA', 'FTAA', 'CSA']);

export const user = pgTable('user', {
    id: serial('id').primaryKey(),
    username: varchar('username').unique().notNull(),
    email: varchar('email').unique().notNull(),
    password: text('password').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    events: jsonb('events').notNull().default('[]'),
    role: roleEnum('role').notNull().default('FTA')
});

export const User = typeof user.$inferInsert;

export const event = pgTable('event', {
    code: varchar('code').primaryKey(),
    pin: varchar('pin').notNull().unique(),
    teams: jsonb('teams').notNull().default('[]'),
    created_at: timestamp('created_at').notNull().defaultNow()
});

export const Event = typeof event.$inferInsert;

export const message = pgTable('messages', {
    id: serial('id').primaryKey(),
    message: varchar('message').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    user_id: serial('user_id').references(() => user.id).notNull(),
    team: varchar('team').notNull(),
    event_code: varchar('event_code').references(() => event.code).notNull(),
    is_ticket: boolean('is_ticket').notNull().default(false),
    is_open: boolean('is_open').notNull().default(true),
    assigned_to: jsonb('assigned_to').notNull().default('[]'),
    closed_at: timestamp('closed_at')
});

export const Message = typeof message.$inferInsert;
