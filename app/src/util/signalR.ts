import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { BYPASS, CODE, ESTOP, GREEN, GREEN_X, MATCH_ABORTED, MATCH_NOT_READY, MATCH_OVER, MATCH_READY, MATCH_RUNNING_AUTO, MATCH_RUNNING_TELEOP, MATCH_TRANSITIONING, MOVE_STATION, NO_CODE, PRESTART_COMPLETED, PRESTART_INITIATED, READY_FOR_POST_RESULT, READY_TO_PRESTART, RED, ROBOT, SignalREnums, UNKNOWN, WRONG_MATCH, type MonitorFrame, type SignalRTeamInfo } from '../../../shared/types';
import { DEFAULT_MONITOR } from '../../../shared/constants';

export class SignalR {
    // SignalR Hub Connection
    public connection: HubConnection | null = null;

    public frame: MonitorFrame = DEFAULT_MONITOR;

    private ip: string;

    private callback: (frame: MonitorFrame) => void;

    constructor(ip: string, callback: (frame: MonitorFrame) => void) {
        this.ip = ip;
        this.callback = callback;
    }

    public async start() {
        console.log('Starting SignalR');
        // Build a connection to the SignalR Hub
        this.connection = new HubConnectionBuilder()
            .withUrl(`http://${this.ip}/fieldMonitorHub`)
            .withServerTimeout(30000) // 30 seconds, per FMS Audience Display
            .withKeepAliveInterval(15000) // 15 seconds per FMS Audience Display
            .configureLogging({
                log: (logLevel, message) => {
                    [console.debug, console.debug, console.log, console.warn, console.error][logLevel](`[SignalR ${logLevel}] ${message}`);
                },
            })
            // .withHubProtocol(new MessagePackHubProtocol())
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds(retryContext) {
                    console.warn('Retrying SignalR connection...');
                    return Math.min(
                        2_000 * retryContext.previousRetryCount,
                        120_000
                    );
                },
            })
            .build();

        // Register listener for the "MatchStatusInfoChanged" event (match starts, ends, changes modes, etc)
        this.connection.on(
            'MatchStatusInfoChanged',
            async (data) => {
                switch (data.p1) {
                    case 0:
                    case 1:
                        break;
                    case 2: // WaitingForPrestart or WaitingForPrestartTO
                    case 3:
                        this.frame.field = READY_TO_PRESTART;
                        break;
                    case 4: // Prestarting or Prestarting TO
                    case 5:
                        this.frame.field = PRESTART_INITIATED;
                        break;
                    case
                        6: // WaitingForSetAudience, WaitingForSetAudienceTO, WaitingForMatchPreview or WaitingForMatchPreviewTO
                    case 7:
                    case 18:
                    case 19:
                        this.frame.field = PRESTART_COMPLETED;
                        break;
                    case 8: // WaitingForMatchReady
                        this.frame.field = MATCH_NOT_READY;
                        break;
                    case 9: // WaitingForMatchStart,
                        this.frame.field = MATCH_READY;
                        break;
                    case 10: // GameSpecific,
                        // What?
                        // $(".matchState").removeClass("matchStateRed");
                        // $(".matchState").addClass("matchStateGreen");
                        // $("#matchStateTop").text("CLEARING GAME DATA");
                        // $("#matchStateBottom").text("FROM DS");
                        this.frame.field = UNKNOWN;
                        break;
                    case 11: // MatchAuto,
                        this.frame.field = MATCH_RUNNING_AUTO
                        break;
                    case 12: // MatchTransition,
                        this.frame.field = MATCH_TRANSITIONING;
                        break;
                    case 13: // MatchTeleop,
                        this.frame.field = MATCH_RUNNING_TELEOP;
                        break;
                    case 14: // WaitingForCommit,
                        this.frame.field = MATCH_OVER;
                        break;
                    case 15: // WaitingForPostResults,
                        this.frame.field = READY_FOR_POST_RESULT;
                        break;
                    case 16: // TournamentLevelComplete,
                        this.frame.field = UNKNOWN;
                        break;
                    case 17: // MatchCancelled
                        this.frame.field = MATCH_ABORTED;
                        // womp womp
                        break;
                }

                try {
                    const response = await fetch(`http://${this.ip}/FieldMonitor/MatchNumberAndPlay`);
                    const json = await response.json();
                    this.frame.match = json[0];
                } catch (err) {
                    console.error("Error while trying to get match number", err);
                }
            }
        );

        // Register listener for the "TeamInfoChanged" event (team connects, disconnects, etc)
        this.connection.on('fieldmonitordatachanged', async (data: SignalRTeamInfo[]) => {
            for (let i = 0; i < data.length; i++) {
                const team: ROBOT = (((data[i].p1 === SignalREnums.AllianceType.Red) ? 'red' : 'blue' ) + data[i].p2) as ROBOT;

                let noise = data[i].pj;
                let signal = data[i].pi;

                this.frame[team] = {
                    number: data[i].p3,
                    ds: dsState(data[i]),
                    radio: (data[i].p7) ? GREEN : RED,
                    rio: (data[i].p8) ? GREEN : RED,
                    code: (data[i].p5) ? CODE : NO_CODE,
                    bwu: data[i].pcc,
                    battery: data[i].pe,
                    ping: data[i].pg,
                    packets: data[i].ph,
                    MAC: data[i].pm,
                    RX: data[i].pt,
                    RXMCS: data[i].pu,
                    TX: data[i].pn,
                    TXMCS: data[i].po,
                    SNR: data[i].pk,
                    noise: (noise) ? parseInt(noise.replace('dBm', '')) : null,
                    signal: (signal) ? parseInt(signal.replace('dBm', '')) : null,
                    versionmm: 0
                }
            }

            console.log(this.frame);

            this.callback(this.frame);
        });

        // Register listener for the "ScheduleAheadBehindChanged" event (how far ahead or behind the schedule is)
        this.connection.on('scheduleAheadBehindChanged', (data) => {
            this.frame.time = data;
        });

        // Register listener for the "RobotVersionDataChanged" event (robot version information)
        // No idea if this works, the field monitor's implementation made no sense
        this.connection.on('robotVersionDataChanged', (data) => {
            console.log(data);

            /*
            // like wtf does this even do? would it not always be true if p3.length is greater than 0?
            var badVersion = false;
            for (var index = 0; index < robotVersionDataParam.p3.length; index++) {
                badVersion = true;
            }
            */

            const team: ROBOT = (((data.p1 === SignalREnums.AllianceType.Red) ? 'red' : 'blue' ) + data.p2) as ROBOT;

            this.frame[team].versionmm = data.p3.length > 0 ? 1 : 0;
        });

        // Register connected/disconnected events
        this.connection.onreconnecting(() => {
            console.log('SignalR Connection Lost, Reconnecting');
        });

        this.connection.onclose(() => {
            console.log('SignalR FMS Connection Closed!');
        });

        // Start connection to SignalR Hub
        return this.connection.start()
    }

    // Fetch the event name
    public async fetchEventName(): Promise<string | null> {
        return this.invokeExpectResponse<Event[]>('GetEvents', 'Events').then((events: Event[]) => {
            console.log(events);
            return this.getCurrentEvent(events)
        }).then((e) => {
            console.log(e);
            return e ? e.name : null;
        }).catch((e) => {
            console.log(
                `‼️ Error Fetching Event Name: ${e}`,
                'err'
            );
            return null;
        });
    }

    /**
     * Find the currently active event from a list of events
     * @param events Events list
     * @returns Currently active event, if any
     */
    public async getCurrentEvent(events: Event[]): Promise<Event | null> {
        if (events.length > 0) {
            const now = new Date();
            const currentEvent = events.find(
                (e) => now >= new Date(e.start) && now <= new Date(e.end)
            );
            if (currentEvent) {
                return Promise.resolve(currentEvent);
            }
        }

        // No Active Event
        return Promise.resolve(null);
    };

    /*
    * This function is used to invoke a SignalR event and wait for a response.
    * @param eventName The name of the event to invoke
    * @param eventResponse The name of the event to listen for the response
    * @param args Any arguments to pass to the event
    * @returns A promise that resolves with the response from the event
    */
    private invokeExpectResponse<t>(eventName: string, eventResponse: string, ...args: any[]): Promise<t> {
        return new Promise<t>((resolve, reject) => {
            if (this.connection == null) {
                reject();
                return;
            }

            const listener = (response: t) => {
                this.connection?.off(eventResponse, listener);
                resolve(response);
            }
            this.connection.on(eventResponse, listener);

            this.connection.invoke(eventName, ...args).catch((err) => {
                console.error(`Failed to invoke '${eventName}'`, err);
                reject(err);
            });
        });
    }
}

function dsState(data: any) {
    if (data.pb) return BYPASS;
    if (data.pc) return ESTOP;
    if (data.p3) {
        if (data.pf === SignalREnums.StationStatusType.Good) return GREEN;
        if (data.pf === SignalREnums.StationStatusType.WrongStation) return MOVE_STATION;
        if (data.pf === SignalREnums.StationStatusType.WrongMatch) return WRONG_MATCH;
        return GREEN_X;
    }
    
    return RED;
}