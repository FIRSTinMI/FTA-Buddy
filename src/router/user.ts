import { z } from "zod";
import { db } from "../db/db";
import { router, publicProcedure } from "../trpc";
import { compare, hash } from "bcrypt";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const userRouter = router({
    login: publicProcedure.input(z.object({
        email: z.string(),
        password: z.string()
    })).query(async ({ input }) => {
        console.log(input);
        const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });

        console.log(user);

        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

        if (await compare(input.password, user.password)) {
            db.update(users).set({ last_seen: new Date() }).where(eq(users.id, user.id));
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
        email: z.string(),
        username: z.string(),
        password: z.string(),
        role: z.enum(['ADMIN', 'FTA', 'FTAA', 'CSA'])
    })).query(async ({ input }) => {
        if (input.role === 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create an admin account' });

        const hashedPassword = await hash(input.password, 12);
        await db.insert(users).values({
            email: input.email,
            username: input.username,
            password: hashedPassword,
            role: input.role
        });
        return true;
    })
});


// // Create a user profile for notes
// app.post('/profile', async (req, res) => {
//     console.log(`New profile request for ${req.body.username}`);

//     const hashedPassword = await hash(req.body.password, 16);
//     const token = randomUUID().replace(/-/g, '');

//     db.query('INSERT INTO profiles VALUES (null, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?);', [req.body.username, hashedPassword, token])
//         .then((result: any) => {
//             let id = result[0].insertId.toString();
//             console.log(`Created with id ${id}`)
//             res.send({ id: id, token: token });
//         }).catch((err: Error) => {
//             res.status(400).send({ error: 'Username already in use' });
//         });
// });

// app.post('/login', async (req, res) => {
//     console.log(`Login request for ${req.body.username}`);
//     db.query('SELECT * FROM profiles WHERE username = ?;', [req.body.username]).spread(async (profiles: ProfilesRow[]) => {
//         if (profiles.length !== 1) {
//             return res.status(404).send({ error: 'Profile not found' });
//         }

//         const match = await compare(req.body.password, profiles[0].password);
//         if (match) {
//             db.query('UPDATE profiles SET last_seen = CURRENT_TIMESTAMP WHERE id = ?;', [profiles[0].id]);
//             res.send(profiles[0]);
//         } else {
//             res.status(401).send({ error: 'Incorrect password' });
//         }
//     });
// });

// // Check if a profile exists
// app.get('/profile/:profile', (req, res) => {
//     db.query('SELECT * FROM profiles WHERE id = ?;', [req.params.profile]).spread((profiles: ProfilesRow[]) => {
//         if (profiles.length !== 1) {
//             return res.status(404).send({ error: 'Profile not found' });
//         }

//         res.send(profiles[0]);
//     });
// });
