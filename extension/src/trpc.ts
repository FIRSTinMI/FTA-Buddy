import { type FMSMatch, TournamentLevel } from "@shared/types";
import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { compressSync } from "fflate";
import SuperJSON from "superjson";
import type { AppRouter } from "../../src/index";
import { getAllLogsForMatch, getCompletedMatches, getCurrentMatch, getMatch } from "./fmsapi";

let cloud: boolean = true;
let useDev: boolean = false;
let id: string = "";
let eventCode: string = "";
let url: string = "";
let eventToken: string = "";

/** Returns the correct cloud origin based on the useDev flag. */
function cloudBase() {
	return useDev ? "https://dev.ftabuddy.com" : "https://ftabuddy.com";
}

export async function updateValues() {
	return new Promise<void>((resolve) => {
		chrome.storage.local.get(["url", "cloud", "useDev", "event", "id", "eventToken"], (item) => {
			cloud = Boolean(item.cloud);
			useDev = Boolean(item.useDev);
			id = String(item.id);
			eventCode = String(item.event);
			url = String(item.url);
			eventToken = String(item.eventToken);

			trpc = createTRPCConnection();

			resolve();
		});
	});
}

/**
 * Routes with large payloads that must bypass batching to avoid
 * URL-length / encoding edge-cases. These are all mutations (POST body).
 */
const BIG_MUTATION_PATHS = new Set(["field.post", "match.putMatchLogs", "match.putCompressedMatchLogs"]);

function createTRPCConnection() {
	const httpUrl = cloud ? cloudBase() + "/trpc" : url + "/trpc";
	const httpHeaders = { "Event-Token": eventToken ?? "" };

	// SSE (EventSource) cannot send custom headers, so pass auth via query params
	const sseUrl = `${httpUrl}?eventToken=${encodeURIComponent(eventToken ?? "")}`;

	return createTRPCClient<AppRouter>({
		links: [
			// 1st split: subscriptions → SSE
			splitLink({
				condition: (op) => op.type === "subscription",
				true: httpSubscriptionLink({ url: sseUrl, transformer: SuperJSON }),
				false: splitLink({
					// 2nd split: big mutations → non-batched httpLink (POST body, no batching quirks)
					condition: (op) => BIG_MUTATION_PATHS.has(op.path),
					true: httpLink({ url: httpUrl, transformer: SuperJSON, headers: httpHeaders }),
					// Everything else → batched for performance
					false: httpBatchLink({ url: httpUrl, transformer: SuperJSON, headers: httpHeaders }),
				}),
			}),
		],
	});
}

export let trpc = createTRPCConnection();

// Tracks fmsMatchIds currently being uploaded to prevent concurrent duplicate uploads
// between the SignalR post-match trigger and the 2-minute auto-import timer.
const inFlightMatchIds = new Set<string>();

export async function uploadMatchLogs() {
	const current = await getCurrentMatch();
	const match = await getMatch(current.matchNumber, current.playNumber, current.level);
	if (inFlightMatchIds.has(match.fmsMatchId)) {
		console.log(`uploadMatchLogs: skipping ${match.fmsMatchId}, already in flight`);
		return;
	}
	await uploadMatchLogsByMatch(match);
}

export async function uploadAllUnimportedMatchLogs(onProgress?: (current: number, total: number) => void) {
	const completed = await getCompletedMatches();

	// Ask the server which FMS match IDs it already has so we skip them
	const allIds = completed.map((m) => m.fmsMatchId);
	const uploadedIds = new Set(await trpc.match.getUploadedMatchIds.query({ ids: allIds }));

	// Also skip anything currently being uploaded by the SignalR trigger
	const missing = completed.filter((m) => !uploadedIds.has(m.fmsMatchId) && !inFlightMatchIds.has(m.fmsMatchId));

	for (let i = 0; i < missing.length; i++) {
		onProgress?.(i, missing.length);
		try {
			await uploadMatchLogsByMatch(missing[i]);
		} catch (err) {
			console.error(`Failed to import match ${missing[i].matchNumber} play ${missing[i].playNumber}:`, err);
		}
	}
	onProgress?.(missing.length, missing.length);
}

// Upload logs for a match using the fmsMatchId directly, bypassing number-based lookup.
async function uploadMatchLogsByMatch(match: FMSMatch) {
	if (inFlightMatchIds.has(match.fmsMatchId)) {
		console.log(`uploadMatchLogsByMatch: skipping ${match.fmsMatchId}, already in flight`);
		return;
	}
	inFlightMatchIds.add(match.fmsMatchId);
	console.log(
		`Uploading match ${match.matchNumber} play ${match.playNumber} (${match.tournamentLevel}) id ${match.fmsMatchId}`,
	);
	const logs = await getAllLogsForMatch(match.fmsMatchId);
	try {
		const upload = {
			event: eventCode,
			level: match.tournamentLevel,
			...match,
			logs: {
				red1: compressStationLog(logs.red1),
				red2: compressStationLog(logs.red2),
				red3: compressStationLog(logs.red3),
				blue1: compressStationLog(logs.blue1),
				blue2: compressStationLog(logs.blue2),
				blue3: compressStationLog(logs.blue3),
			},
		};
		await trpc.match.putCompressedMatchLogs.mutate(upload);
	} catch (err) {
		console.error(err);
		console.log(`Uploading logs uncompressed for ${match.fmsMatchId}`);
		const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
		await trpc.match.putMatchLogs.mutate(upload);
	} finally {
		inFlightMatchIds.delete(match.fmsMatchId);
	}
	console.log(`done ${match.fmsMatchId}`);
}

export function compressStationLog(log: any[]) {
	const enc = new TextEncoder();
	const buf = enc.encode(JSON.stringify(log));
	const compressed = compressSync(buf, { level: 6, mem: 6 });
	return btoa(String.fromCharCode(...compressed));
}

// uploadMatchLogsForMatch is kept for the SignalR path which resolves by match number.
export async function uploadMatchLogsForMatch(matchNumber: number, playNumber: number, level: TournamentLevel) {
	const match = await getMatch(matchNumber, playNumber, level);
	await uploadMatchLogsByMatch(match);
}
