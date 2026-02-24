import { TournamentLevel } from "@shared/types";
import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { compressSync } from "fflate";
import SuperJSON from "superjson";
import type { AppRouter } from "../../src/index";
import { getAllLogsForMatch, getCurrentMatch, getMatch } from "./fmsapi";

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

export async function uploadMatchLogs() {
	const matchNumber = await getCurrentMatch();
	const match = await getMatch(matchNumber.matchNumber, matchNumber.playNumber, matchNumber.level);
	const logs = await getAllLogsForMatch(match.fmsMatchId);
	console.log(
		`Trying to compress logs for match ${matchNumber.matchNumber} play ${matchNumber.playNumber} id ${match.fmsMatchId}`,
	);
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

		console.debug(upload);
		await trpc.match.putCompressedMatchLogs.mutate(upload);
	} catch (err) {
		console.error(err);
		console.log(`Uploading logs uncompressed`);
		const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
		console.debug(upload);
		await trpc.match.putMatchLogs.mutate(upload);
	}
	console.log("done");
}

export function compressStationLog(log: any[]) {
	const enc = new TextEncoder();
	const buf = enc.encode(JSON.stringify(log));
	const compressed = compressSync(buf, { level: 6, mem: 6 });
	return btoa(String.fromCharCode(...compressed));
}

export async function uploadMatchLogsForMatch(matchNumber: number, playNumber: number, level: TournamentLevel) {
	const match = await getMatch(matchNumber, playNumber, level);
	const logs = await getAllLogsForMatch(match.fmsMatchId);
	console.log(`Trying to compress logs for match ${matchNumber} play ${playNumber} id ${match.fmsMatchId}`);
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

		console.debug(upload);
		await trpc.match.putCompressedMatchLogs.mutate(upload);
	} catch (err) {
		console.error(err);
		console.log(`Uploading logs uncompressed`);
		const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
		console.debug(upload);
		await trpc.match.putMatchLogs.mutate(upload);
	}
	console.log("done");
}
