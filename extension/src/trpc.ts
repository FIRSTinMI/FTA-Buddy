import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/index';
import { getAllLogsForMatch, getCurrentMatch, getMatch } from './fmsapi';

let cloud = true;
let id = '';
let eventCode = '';

async function updateValues() {
    return new Promise<void>((resolve) => {
        chrome.storage.local.get(['cloud', 'id', 'event'], item => {
            cloud = item.cloud;
            id = item.id;
            eventCode = item.event;

            trpc = createTRPCClient<AppRouter>({
                links: [
                    httpBatchLink({
                        url: (cloud) ? `https://ftabuddy.com` : 'http://localhost:3002' + '/trpc',
                        headers: {
                            'Authorization': `Bearer ${id}`,
                            'Event-Token': 'undefined'
                        }
                    }),
                ],
            });

            resolve();
        });
    });
}

updateValues();

export let trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: 'https://ftabuddy.com/trpc',
            headers: {
                'Authorization': `Bearer ${id}`,
                'Event-Token': 'undefined'
            }
        }),
    ],
});

export async function uploadMatchLogs() {
    await updateValues();
    const matchNumber = await getCurrentMatch();
    const match = await getMatch(matchNumber.matchNumber, matchNumber.playNumber, matchNumber.level);
    const logs = await getAllLogsForMatch(match.fmsMatchId);
    console.log(`Uploading logs for match ${matchNumber.matchNumber} play ${matchNumber.playNumber} id ${match.fmsMatchId}`);
    const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
    console.debug(upload);
    await trpc.match.putMatchLogs.query(upload);
}