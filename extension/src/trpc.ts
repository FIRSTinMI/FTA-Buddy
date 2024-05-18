import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AppRouter } from '../../src/index';
import { getAllLogsForMatch, getCurrentMatch, getMatch } from './fmsapi';
import SuperJSON from 'superjson';

let cloud: boolean = true;
let id: string = '';
let eventCode: string = '';
let url: string = '';
let eventToken: string = '';

let wsClient = createWSClient({
    url: url.replace('http', 'ws') + '/ws',
});

export async function updateValues() {
    return new Promise<void>((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'id', 'eventToken'], item => {
            cloud = item.cloud;
            id = item.id;
            eventCode = item.event;
            url = item.url;
            eventToken = item.eventToken;

            wsClient = createWSClient({
                url: url.replace('http', 'ws') + '/ws',
            });

            trpc = createTRPCConnection();

            resolve();
        });
    });
}

function createTRPCConnection() {
    return createTRPCClient<AppRouter>({
        links: [
            splitLink({
                condition(op) {
                    return op.type === 'subscription' || op.path === 'field.post';
                },
                true: wsLink({
                    client: wsClient,
                    transformer: SuperJSON
                }),
                false: httpBatchLink({
                    url: url + '/trpc',
                    transformer: SuperJSON,
                    headers: {
                        'Event-Token': eventToken ?? '',
                    }
                }),
            })
        ],
    });
}

export let trpc = createTRPCConnection();

export async function uploadMatchLogs() {
    const matchNumber = await getCurrentMatch();
    const match = await getMatch(matchNumber.matchNumber, matchNumber.playNumber, matchNumber.level);
    const logs = await getAllLogsForMatch(match.fmsMatchId);
    console.log(`Uploading logs for match ${matchNumber.matchNumber} play ${matchNumber.playNumber} id ${match.fmsMatchId}`);
    const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
    console.debug(upload);
    await trpc.match.putMatchLogs.query(upload);
}