// @mentions in note replies. Usernames are free text and may contain spaces, so a mention
// is "@" followed by the longest event username that matches, case-insensitively, and is
// not followed by another letter or digit ("@Sam" does not match inside "@Samantha").

export interface MentionUser {
	id: number;
	username: string;
}

export type MentionSegment = { text: string; user?: MentionUser };

const WORD = /[\p{L}\p{N}_]/u;

/** Split text into plain runs and mentions of the given users, in order. */
export function splitMentions(text: string, users: MentionUser[]): MentionSegment[] {
	const byLength = users.filter((u) => u.username.trim()).sort((a, b) => b.username.length - a.username.length);
	const segments: MentionSegment[] = [];
	let plainStart = 0;
	let i = 0;
	while (i < text.length) {
		const at = text.indexOf("@", i);
		if (at === -1) break;
		const before = at > 0 ? text[at - 1] : "";
		let user: MentionUser | undefined;
		if (!before || !WORD.test(before)) {
			const rest = text.slice(at + 1).toLowerCase();
			user = byLength.find((u) => {
				const name = u.username.toLowerCase();
				if (!rest.startsWith(name)) return false;
				const after = text[at + 1 + name.length];
				return !after || !WORD.test(after);
			});
		}
		if (!user) {
			i = at + 1;
			continue;
		}
		if (at > plainStart) segments.push({ text: text.slice(plainStart, at) });
		const end = at + 1 + user.username.length;
		segments.push({ text: text.slice(at, end), user });
		plainStart = i = end;
	}
	if (plainStart < text.length) segments.push({ text: text.slice(plainStart) });
	return segments;
}

/** The distinct users mentioned in text. */
export function findMentions(text: string, users: MentionUser[]): MentionUser[] {
	const found = new Map<number, MentionUser>();
	for (const s of splitMentions(text, users)) if (s.user) found.set(s.user.id, s.user);
	return [...found.values()];
}
