import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AppRouter } from '../../src/index';
import SuperJSON from 'superjson';

let cloud: boolean = true;
let id: string = '';
let eventCode: string = '';
let url: string = '';
let eventToken: string = '';
let extensionId: string = '';

let linkURL = (cloud ? 'wss://ftabuddy.com/ws' : (url.replace('http', 'ws') + '/ws'));
console.log(linkURL);

// let wsClient = createWSClient({
//     url: linkURL,
// });

export async function updateValues(item: { cloud: boolean, id: string, event: string, url: string, eventToken: string, extensionId?: string; }) {
    cloud = item.cloud;
    id = item.id;
    eventCode = item.event;
    url = item.url;
    eventToken = item.eventToken;
    extensionId = item.extensionId || '';

    linkURL = (cloud ? 'wss://ftabuddy.com/ws' : (url.replace('http', 'ws') + '/ws'));
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
                url: (cloud ? 'https://ftabuddy.com/trpc' : url + '/trpc'),
                transformer: SuperJSON,
                headers: {
                    'Event-Token': eventToken ?? '',
                    'Extension-Id': extensionId ?? '',
                }
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
