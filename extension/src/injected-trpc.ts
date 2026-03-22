import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import type { AppRouter } from "../../src/index";
import type { FMSLogFrame, FMSMatch, ROBOT } from "../../shared/types";

let cloud: boolean = true;
let useDev: boolean = false;
let id: string = "";
let eventCode: string = "";
let url: string = "";
let eventToken: string = "";
let extensionId: string = "";

function cloudBase() {
	return useDev ? "https://dev.ftabuddy.com" : "https://ftabuddy.com";
}

let linkURL = cloud ? cloudBase().replace("https", "wss") + "/ws" : url.replace("http", "ws") + "/ws";
console.log(linkURL);

// let wsClient = createWSClient({
//     url: linkURL,
// });

export async function updateValues(item: {
	cloud: boolean;
	useDev?: boolean;
	id: string;
	event: string;
	url: string;
	eventToken: string;
	extensionId?: string;
}) {
	cloud = item.cloud;
	useDev = Boolean(item.useDev);
	id = item.id;
	eventCode = item.event;
	url = item.url;
	eventToken = item.eventToken;
	extensionId = item.extensionId || "";

	linkURL = cloud ? cloudBase().replace("https", "wss") + "/ws" : url.replace("http", "ws") + "/ws";
	console.log(linkURL);

	// wsClient = createWSClient({
	//     url: linkURL,
	// });

	trpc = createTRPCConnection();
}

function createTRPCConnection() {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: cloud ? cloudBase() + "/trpc" : url + "/trpc",
				transformer: SuperJSON,
				headers: {
					"Event-Token": eventToken ?? "",
					"Extension-Id": extensionId ?? "",
				},
			}),
			// splitLink({
			//     condition(op) {
			//         return op.type === 'subscription' || op.path === 'field.post' || op.path === 'match.putMatchLogs';
			//     },
			//     true: wsLink({
			//         client: wsClient,
			//         transformer: SuperJSON
			//     }),
			//     false: httpBatchLink({
			//         url: (cloud ? 'https://ftabuddy.com/trpc' : url + '/trpc'),
			//         transformer: SuperJSON,
			//         headers: {
			//             'Event-Token': eventToken ?? '',
			//             'Extension-Id': extensionId ?? '',
			//         }
			//     }),
			// })
		],
	});
}

export let trpc = createTRPCConnection();

const FMS_HOST = "10.0.100.5";
const LEVELS = ["Practice", "Qualification", "Playoff"] as const;
const STATIONS = ["Station1", "Station2", "Station3"] as const;

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`FMS fetch ${url} → ${res.status}`);
	return res.json() as Promise<T>;
}

async function getCompletedMatches(): Promise<FMSMatch[]> {
	const results = await Promise.all(
		LEVELS.map(async (level) => {
			try {
				return await fetchJson<FMSMatch[]>(
					`http://${FMS_HOST}/api/v1.0/fieldmonitor/get/GetResults/${level}`,
				);
			} catch {
				return [] as FMSMatch[];
			}
		}),
	);
	return results.flat().filter((m) => !!m.actualStartTime);
}

async function getAllLogsForMatch(matchId: string) {
	const logs: Record<ROBOT, FMSLogFrame[]> = {
		red1: [], red2: [], red3: [], blue1: [], blue2: [], blue3: [],
	};
	for (let i = 0; i < 3; i++) {
		logs[`red${i + 1}` as ROBOT] = await fetchJson(
			`http://${FMS_HOST}/api/v1.0/fieldmonitor/get/GetLog/${matchId}/Red/${STATIONS[i]}`,
		);
		logs[`blue${i + 1}` as ROBOT] = await fetchJson(
			`http://${FMS_HOST}/api/v1.0/fieldmonitor/get/GetLog/${matchId}/Blue/${STATIONS[i]}`,
		);
	}
	return logs;
}

const inFlightMatchIds = new Set<string>();

async function uploadMatch(match: FMSMatch) {
	if (inFlightMatchIds.has(match.fmsMatchId)) return;
	inFlightMatchIds.add(match.fmsMatchId);
	console.log(
		`[FTA Buddy] Uploading match ${match.matchNumber} play ${match.playNumber} (${match.tournamentLevel})`,
	);
	try {
		const logs = await getAllLogsForMatch(match.fmsMatchId);
		await trpc.match.putMatchLogs.mutate({ event: eventCode, level: match.tournamentLevel, ...match, logs });
		console.log(`[FTA Buddy] Upload done ${match.fmsMatchId}`);
	} finally {
		inFlightMatchIds.delete(match.fmsMatchId);
	}
}

export async function uploadAllUnimportedMatchLogs() {
	const completed = await getCompletedMatches();
	if (completed.length === 0) return;

	const allIds = completed.map((m) => m.fmsMatchId);
	const uploadedIds = new Set(await trpc.match.getUploadedMatchIds.query({ ids: allIds }));
	const missing = completed.filter((m) => !uploadedIds.has(m.fmsMatchId) && !inFlightMatchIds.has(m.fmsMatchId));

	for (const match of missing) {
		try {
			await uploadMatch(match);
		} catch (err) {
			console.error(`[FTA Buddy] Failed to upload match ${match.matchNumber} play ${match.playNumber}:`, err);
		}
	}
}
