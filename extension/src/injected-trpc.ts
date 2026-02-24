import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import type { AppRouter } from "../../src/index";

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
