/**
 * server.ts — Fetch team names and open notes from the FTA Buddy server.
 * Uses GM_xmlhttpRequest to bypass CORS restrictions.
 */

declare function GM_xmlhttpRequest(details: {
	method: string;
	url: string;
	headers?: Record<string, string>;
	data?: string;
	onload?: (response: { status: number; responseText: string }) => void;
	onerror?: (err: any) => void;
	ontimeout?: () => void;
	timeout?: number;
}): void;

export interface TeamInfo {
	number: string;
	name: string;
	inspected: boolean;
}

function gmFetch(url: string, body: unknown): Promise<any> {
	return new Promise((resolve, reject) => {
		GM_xmlhttpRequest({
			method: "POST",
			url,
			headers: { "Content-Type": "application/json" },
			data: JSON.stringify(body),
			timeout: 10_000,
			onload: (res) => {
				if (res.status >= 200 && res.status < 300) {
					try {
						resolve(JSON.parse(res.responseText));
					} catch {
						resolve(null);
					}
				} else {
					reject(new Error(`HTTP ${res.status}`));
				}
			},
			onerror: reject,
			ontimeout: () => reject(new Error("Timeout")),
		});
	});
}

function trpcUrl(baseUrl: string, path: string): string {
	// tRPC v11 HTTP endpoint: POST /trpc/<procedure>
	const base = baseUrl.replace(/\/$/, "");
	return `${base}/trpc/${path}`;
}

export async function fetchTeams(
	ftaBuddyUrl: string,
	eventToken: string,
): Promise<Record<number, TeamInfo>> {
	try {
		const res = await gmFetch(trpcUrl(ftaBuddyUrl, "event.getTeams"), {
			json: {},
			meta: { values: {} },
		});
		const teams: TeamInfo[] = res?.result?.data ?? res?.result?.data?.json ?? [];
		const map: Record<number, TeamInfo> = {};
		for (const t of teams) {
			map[Number(t.number)] = t;
		}
		return map;
	} catch (err) {
		console.warn("[FTA Buddy] fetchTeams failed:", err);
		return {};
	}
}

export async function fetchOpenNoteTeams(
	ftaBuddyUrl: string,
	eventToken: string,
): Promise<Set<number>> {
	try {
		const res = await gmFetch(trpcUrl(ftaBuddyUrl, "notes.getAll"), {
			json: {},
			meta: { values: {} },
		});
		const notes: Array<{ team: number | null; closed_at: string | null }> =
			res?.result?.data ?? res?.result?.data?.json ?? [];
		const open = new Set<number>();
		for (const note of notes) {
			if (note.team !== null && note.closed_at === null) {
				open.add(note.team);
			}
		}
		return open;
	} catch (err) {
		console.warn("[FTA Buddy] fetchOpenNoteTeams failed:", err);
		return new Set();
	}
}

function makeHeaders(eventToken: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"x-event-token": eventToken,
	};
}

export async function fetchTeamsWithAuth(
	ftaBuddyUrl: string,
	eventToken: string,
): Promise<Record<number, TeamInfo>> {
	try {
		const url = trpcUrl(ftaBuddyUrl, "event.getTeams");
		const res: any = await new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "POST",
				url,
				headers: makeHeaders(eventToken),
				data: JSON.stringify({ json: {}, meta: { values: {} } }),
				timeout: 10_000,
				onload: (r) => {
					if (r.status >= 200 && r.status < 300) {
						try { resolve(JSON.parse(r.responseText)); }
						catch { resolve(null); }
					} else {
						reject(new Error(`HTTP ${r.status}`));
					}
				},
				onerror: reject,
				ontimeout: () => reject(new Error("Timeout")),
			});
		});
		const teams: TeamInfo[] = res?.result?.data ?? [];
		const map: Record<number, TeamInfo> = {};
		for (const t of teams) map[Number(t.number)] = t;
		return map;
	} catch (err) {
		console.warn("[FTA Buddy] fetchTeamsWithAuth failed:", err);
		return {};
	}
}

export async function fetchOpenNoteTeamsWithAuth(
	ftaBuddyUrl: string,
	eventToken: string,
): Promise<Set<number>> {
	try {
		const url = trpcUrl(ftaBuddyUrl, "notes.getAll");
		const res: any = await new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "POST",
				url,
				headers: makeHeaders(eventToken),
				data: JSON.stringify({ json: {}, meta: { values: {} } }),
				timeout: 10_000,
				onload: (r) => {
					if (r.status >= 200 && r.status < 300) {
						try { resolve(JSON.parse(r.responseText)); }
						catch { resolve(null); }
					} else {
						reject(new Error(`HTTP ${r.status}`));
					}
				},
				onerror: reject,
				ontimeout: () => reject(new Error("Timeout")),
			});
		});
		const notes: Array<{ team: number | null; closed_at: string | null }> = res?.result?.data ?? [];
		const open = new Set<number>();
		for (const note of notes) {
			if (note.team !== null && note.closed_at === null) open.add(note.team);
		}
		return open;
	} catch (err) {
		console.warn("[FTA Buddy] fetchOpenNoteTeamsWithAuth failed:", err);
		return new Set();
	}
}
