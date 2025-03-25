import { TournamentLevel } from '@shared/types';
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import { compressSync } from 'fflate';
import SuperJSON from 'superjson';
import type { AppRouter } from '../../src/index';
import { getAllLogsForMatch, getCurrentMatch, getMatch } from './fmsapi';

let cloud: boolean = true;
let id: string = '';
let eventCode: string = '';
let url: string = '';
let eventToken: string = '';

let linkURL = (cloud ? 'wss://ftabuddy.com/ws' : (url.replace('http', 'ws') + '/ws'));
console.log(linkURL);

let wsClient = createWSClient({
    url: linkURL,
});

export async function updateValues() {
    return new Promise<void>((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'id', 'eventToken'], item => {
            cloud = item.cloud;
            id = item.id;
            eventCode = item.event;
            url = item.url;
            eventToken = item.eventToken;

            linkURL = (cloud ? 'wss://ftabuddy.com/ws' : (url.replace('http', 'ws') + '/ws'));
            console.log(linkURL);

            wsClient = createWSClient({
                url: linkURL,
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
                    return op.type === 'subscription' || op.path === 'field.post' || op.path === 'match.putMatchLogs' || op.path === 'match.putCompressedMatchLogs';
                },
                true: wsLink({
                    client: wsClient,
                    transformer: SuperJSON
                }),
                false: httpBatchLink({
                    url: (cloud ? 'https://ftabuddy.com/trpc' : url + '/trpc'),
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
    console.log(`Trying to compress logs for match ${matchNumber.matchNumber} play ${matchNumber.playNumber} id ${match.fmsMatchId}`);
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
            }
        };

        console.debug(upload);
        await trpc.match.putCompressedMatchLogs.query(upload);
    } catch (err) {
        console.error(err);
        console.log(`Uploading logs uncompressed`);
        const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
        console.debug(upload);
        await trpc.match.putMatchLogs.query(upload);
    }
    console.log('done');
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
            }
        };

        console.debug(upload);
        await trpc.match.putCompressedMatchLogs.query(upload);
    } catch (err) {
        console.error(err);
        console.log(`Uploading logs uncompressed`);
        const upload = { event: eventCode, level: match.tournamentLevel, ...match, logs };
        console.debug(upload);
        await trpc.match.putMatchLogs.query(upload);
    }
    console.log('done');
}
