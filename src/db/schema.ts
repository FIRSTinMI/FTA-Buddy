import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum('role', ['FTA', 'FTAA', 'CSA', 'RI']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: varchar('username').notNull(),
    email: varchar('email').unique().notNull(),
    password: text('password').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    last_seen: timestamp('last_seen').notNull().defaultNow(),
    events: jsonb('events').notNull().default('[]'),
    role: roleEnum('role').notNull().default('FTA'), 
    token: varchar('token').notNull().default(''),
    admin: boolean('admin').notNull().default(false),
});

export const User = typeof users.$inferInsert;

export const events = pgTable('events', {
    code: varchar('code').primaryKey(),
    pin: varchar('pin').notNull(),
    teams: jsonb('teams').notNull().default('[]'),
    created_at: timestamp('created_at').notNull().defaultNow(),
    token: varchar('token').notNull().default('').unique(),
    checklist: jsonb('checklist').notNull().default('[]'),
    users: jsonb('users').notNull().default('[]'),
    scheduleDetails: jsonb('scheduleDetails').notNull().default('{}'),
    archived: boolean('archived').notNull().default(false),
});

export const Event = typeof events.$inferInsert;

export const tickets = pgTable('tickets', {
    id: serial('id').primaryKey(),
    team: integer('team').notNull().default(-1),
    subject: varchar('subject').notNull().default(''),
    author_id: integer('author_id').notNull(),
    author: jsonb('author').notNull(),
    assigned_to_id: integer('assigned_to').notNull().default(-1),
    assigned_to: jsonb('assigned_to'),
    event_code: varchar('event_code').notNull().default(''),
    is_open: boolean('is_open').notNull().default(true),
    text: varchar('text').notNull().default(''),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
    closed_at: timestamp('closed_at'),
    messages: jsonb('messages').notNull().default('[]'),
    match_id: uuid('match_id').references(() => matchLogs.id),
    followers: jsonb('followers').notNull().default('[]')
});

export const Ticket = typeof tickets.$inferInsert;

export const messages = pgTable('messages', {
    id: uuid('id').primaryKey(),
    ticket_id: serial('ticket_id').references(() => tickets.id),
    text: varchar('text').notNull().default(''),
    author_id: integer('author_id').notNull(),
    author: jsonb('author').notNull(),
    event_code: varchar('event_code').notNull().default(''),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const Message = typeof messages.$inferInsert;

export const notes = pgTable('notes', {
    id: uuid('id').primaryKey(),
    text: varchar('text').notNull().default(''),
    author_id: integer('author_id').notNull(),
    author: jsonb('author').notNull(),
    team: integer('team').notNull().default(-1),
    event_code: varchar('event_code').notNull().default(''),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const Note = typeof notes.$inferInsert;

export const levelEnum = pgEnum('level', ['None', 'Practice', 'Qualification', 'Playoff']);

export const matchLogs = pgTable('match_logs', {
    id: uuid('id').primaryKey(),
    event: varchar('event').notNull(),
    event_id: uuid('event_id').notNull(),
    match_number: integer('match_number').notNull(),
    play_number: integer('play_number').notNull(),
    level: levelEnum('level').notNull(),
    start_time: timestamp('start_time').notNull(),
    blue1: integer('blue1'),
    blue2: integer('blue2'),
    blue3: integer('blue3'),
    red1: integer('red1'),
    red2: integer('red2'),
    red3: integer('red3'),
    blue1_log: jsonb('blue1_log').notNull().default('[]'),
    blue2_log: jsonb('blue2_log').notNull().default('[]'),
    blue3_log: jsonb('blue3_log').notNull().default('[]'),
    red1_log: jsonb('red1_log').notNull().default('[]'),
    red2_log: jsonb('red2_log').notNull().default('[]'),
    red3_log: jsonb('red3_log').notNull().default('[]'),
    analyzed: boolean('analyzed').notNull().default(false),
});

export const MatchLog = typeof matchLogs.$inferInsert;

export const analyzedLogs = pgTable('analyzed_logs', {
    id: uuid('id').primaryKey(),
    match_id: uuid('match_id').references(() => matchLogs.id).notNull(),
    event: varchar('event').notNull(),
    match_number: integer('match_number').notNull(),
    play_number: integer('play_number').notNull(),
    level: levelEnum('level').notNull(),
    team: integer('team').notNull(),
    alliance: varchar('alliance').notNull(),
    events: jsonb('events').notNull().default('[]'),
    bypassed: boolean('bypassed').notNull().default(false),
});

export const cycleLogs = pgTable('cycle_logs', {
    id: uuid('id').primaryKey(),
    event: varchar('event').notNull(),
    match_number: integer('match_number').notNull(),
    play_number: integer('play_number').notNull(),
    level: levelEnum('level').notNull(),
    prestart_time: timestamp('prestart_time'),
    start_time: timestamp('start_time'),
    calculated_cycle_time: varchar('calculated_cycle_time'),
    ref_done_time: timestamp('ref_done_time'),
    scores_posted_time: timestamp('scores_posted_time'),
    end_time: timestamp('end_time')
});

export const CycleLog = typeof cycleLogs.$inferSelect;

export const logPublishing = pgTable('log_publishing', {
    id: uuid('id').primaryKey(),
    team: integer('team').notNull(),
    match_id: uuid('match_id').notNull(),
    station: varchar('station').notNull(),
    event: varchar('event').notNull(),
    event_id: uuid('event_id').notNull(),
    match_number: integer('match_number').notNull(),
    play_number: integer('play_number').notNull(),
    level: levelEnum('level').notNull(),
    start_time: timestamp('start_time').notNull(),
    publish_time: timestamp('publish_time').defaultNow(),
    expire_time: timestamp('expire_time').notNull()
});

export const robotCycleLogs = pgTable('team_cycle_logs', {
    id: uuid('id').primaryKey(),
    event: varchar('event').notNull(),
    match_number: integer('match_number').notNull(),
    play_number: integer('play_number').notNull(),
    level: levelEnum('level').notNull(),
    team: integer('team').notNull(),
    prestart: timestamp('prestart'),
    first_ds: timestamp('first_ds'),
    last_ds: timestamp('last_ds'),
    time_ds: integer('time_ds'),
    first_radio: timestamp('first_radio'),
    last_radio: timestamp('last_radio'),
    time_radio: integer('time_radio'),
    first_rio: timestamp('first_rio'),
    last_rio: timestamp('last_rio'),
    time_rio: integer('time_rio'),
    first_code: timestamp('first_code'),
    last_code: timestamp('last_code'),
    time_code: integer('time_code'),
});

export const RobotCycleLog = typeof robotCycleLogs.$inferInsert;

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: serial('id').primaryKey(),
    user_id: serial('user_id').references(() => users.id).notNull(),
    endpoint: text('endpoint').notNull(),
    expirationTime: timestamp('expirationTime'),
    keys: jsonb('keys').notNull()
});

export default { events, users, messages, matchLogs, cycleLogs, logPublishing };