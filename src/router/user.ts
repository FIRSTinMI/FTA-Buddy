import { z } from "zod";
import { db } from "../db/db";
import { router, publicProcedure } from "../trpc";
import { compare, hash } from "bcrypt";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const userRouter = router({
    login: publicProcedure.input(z.object({
        email: z.string(),
        password: z.string()
    })).query(async ({ input }) => {
        const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });

        console.log(user);

        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

        if (await compare(input.password, user.password)) {
            db.update(users).set({ last_seen: new Date() }).where(eq(users.id, user.id));
            if (user.token === '') {
                let token = generateToken();
                await db.update(users).set({ token }).where(eq(users.id, user.id));
                return { ...user, token };
            }
            return user;
        } else {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
        }
    }),

    changePassword: publicProcedure.input(z.object({
        email: z.string(),
        oldPassword: z.string(),
        newPassword: z.string()
    })).query(async ({ input }) => {
        const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });

        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

        if (await compare(input.oldPassword, user.password)) {
            const hashedPassword = await hash(input.newPassword, 12);
            await db.update(users).set({ password: hashedPassword }).where(eq(users.id, user.id));
            return true;
        } else {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' });
        }
    }),

    createAccount: publicProcedure.input(z.object({
        email: z.string().email({ message: "Invalid email address" }),
        username: z.string().min(3, { message: "Username must be at least 3 characters long" }),
        password: z.string().min(8, { message: "Password must be at least 8 characters long" }),
        role: z.enum(['ADMIN', 'FTA', 'FTAA', 'CSA', 'RI'])
    })).query(async ({ input }) => {
        if (input.role === 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create an admin account' });

        const hashedPassword = await hash(input.password, 12);
        const token = generateToken();
        await db.insert(users).values({
            email: input.email,
            username: input.username,
            password: hashedPassword,
            role: input.role,
            token: token
        });

        const res = await db.query.users.findFirst({ where: eq(users.email, input.email) });
        if (!res) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'User not created' });

        return {
            token,
            id: res.id,
        };
    }),

    googleLogin: publicProcedure.input(z.object({
        token: z.string()
    })).query(async ({ input }) => {
        const ticket = await client.verifyIdToken({
            idToken: input.token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        if (!payload) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' });

        console.log(payload);

        const email = payload['email'] as string;
        const user = await db.query.users.findFirst({ where: eq(users.email, email) });

        if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        } else {
            db.update(users).set({ last_seen: new Date() }).where(eq(users.id, user.id));
            if (user.token === '') {
                let token = generateToken();
                await db.update(users).set({ token }).where(eq(users.id, user.id));
                return { ...user, token };
            }
            return user;
        }
    }),

    createGoogleUser: publicProcedure.input(z.object({
        token: z.string(),
        username: z.string().min(3, { message: "Username must be at least 3 characters long" }),
        role: z.enum(['ADMIN', 'FTA', 'FTAA', 'CSA', 'RI'])
    })).query(async ({ input }) => {
        const ticket = await client.verifyIdToken({
            idToken: input.token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        if (!payload) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' });

        console.log(payload);

        const email = payload['email'] as string;
        const user = await db.query.users.findFirst({ where: eq(users.email, email) });

        if (user) {
            throw new TRPCError({ code: 'CONFLICT', message: 'User already exists' });
        } else {
            const username = payload['name'] as string;
            const token = generateToken();
            await db.insert(users).values({
                email,
                username,
                password: 'google',
                role: 'FTA',
                token
            });

            const res = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (!res) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'User not created' });

            return {
                token,
                id: res.id,
                email
            };
        }
    }),

});

export function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
