import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { DSState, EnableState, FMSEnums, FieldState, MatchState, PartialMonitorFrame, ROBOT, type SignalRMonitorFrame } from '../../shared/types';
import { DEFAULT_MONITOR } from '../../shared/constants';
import { uploadMatchLogs } from './trpc';

export class SignalR {
    // SignalR Hub Connection
    public connection: HubConnection | null = null;

    public infrastructureConnection: HubConnection | null = null;

    public gameSpecificConnection: HubConnection | null = null;

    public frame: PartialMonitorFrame = DEFAULT_MONITOR;

    private ip: string;

    private callback: (frame: PartialMonitorFrame) => void;

    private cycleTimeCallback: (type: 'lastCycleTime' | 'prestart' | 'start' | 'end' | 'refsDone' | 'scoresPosted', time: string) => void;

    private sendScheduleCallback: () => void;

    constructor(ip: string, version: string, callback: (frame: PartialMonitorFrame) => void, cycleTimeCallback: (type: 'lastCycleTime' | 'prestart' | 'start' | 'end' | 'refsDone' | 'scoresPosted', time: string) => void, sendScheduleCallback: () => void) {
        this.ip = ip;
        this.callback = callback;
        this.frame.version = version;
        this.cycleTimeCallback = cycleTimeCallback;
        this.sendScheduleCallback = sendScheduleCallback;
    }

    public async start() {
        console.log('Starting SignalR');
        // Build a connection to the SignalR Hub
        console.log(`http://${this.ip}/fieldMonitorHub`);
        this.connection = new HubConnectionBuilder()
            .withUrl(`http://${this.ip}/fieldMonitorHub`)
            .withServerTimeout(30000) // 30 seconds, per FMS Audience Display
            .withKeepAliveInterval(15000) // 15 seconds per FMS Audience Display
            .configureLogging({
                log: (logLevel, message) => {
                    // Prevent showing errors in the extension for things that are expected to fail sometimes
                    if (
                        message.startsWith('Failed to complete negotiation') ||
                        message.startsWith('Failed to start the connection') ||
                        message.startsWith('Error from HTTP request')
                    ) return console.log(`[SignalR ${logLevel}] ${message}`);

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

        this.infrastructureConnection = new HubConnectionBuilder()
            .withUrl(`http://${this.ip}/infrastructureHub`)
            .withServerTimeout(30000) // 30 seconds, per FMS Audience Display
            .withKeepAliveInterval(15000) // 15 seconds per FMS Audience Display
            .configureLogging({
                log: (logLevel, message) => {
                    // Prevent showing errors in the extension for things that are expected to fail sometimes
                    if (
                        message.startsWith('Failed to complete negotiation') ||
                        message.startsWith('Failed to start the connection') ||
                        message.startsWith('Error from HTTP request')
                    ) return console.log(`[SignalR ${logLevel}] ${message}`);

                    [console.debug, console.debug, console.log, console.warn, console.error][logLevel](`[SignalR ${logLevel}] ${message}`);
                },
            })
            // .withHubProtocol(new MessagePackHubProtocol())
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds(retryContext) {
                    console.log('Retrying SignalR connection...');
                    return Math.min(
                        2_000 * retryContext.previousRetryCount,
                        120_000
                    );
                },
            })
            .build();

        this.gameSpecificConnection = new HubConnectionBuilder()
            .withUrl(`http://${this.ip}/gameSpecificHub`)
            .withServerTimeout(30000) // 30 seconds, per FMS Audience Display
            .withKeepAliveInterval(15000) // 15 seconds per FMS Audience Display
            .configureLogging({
                log: (logLevel, message) => {
                    // Prevent showing errors in the extension for things that are expected to fail sometimes
                    if (
                        message.startsWith('Failed to complete negotiation') ||
                        message.startsWith('Failed to start the connection') ||
                        message.startsWith('Error from HTTP request')
                    ) return console.log(`[SignalR ${logLevel}] ${message}`);

                    [console.debug, console.debug, console.log, console.warn, console.error][logLevel](`[SignalR ${logLevel}] ${message}`);
                },
            })
            // .withHubProtocol(new MessagePackHubProtocol())
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds(retryContext) {
                    console.log('Retrying SignalR connection...');
                    return Math.min(
                        2_000 * retryContext.previousRetryCount,
                        120_000
                    );
                },
            })
            .build();

        // Register listener for the "MatchStatusInfoChanged" event (match starts, ends, changes modes, etc)
        this.connection.on(
            'matchstatusinfochanged',
            async (data) => {
                switch (data.MatchState) {
                    case 0:
                    case 1:
                        break;
                    case 'WaitingForPrestart':
                    case 'WaitingForPrestartTO':
                        this.frame.field = FieldState.READY_TO_PRESTART;
                        break;
                    case 'Prestarting':
                    case 'PrestartingTO':
                        this.frame.field = FieldState.PRESTART_INITIATED;
                        break;
                    case
                        'WaitingForSetAudience':
                    case 'WaitingForSetAudienceTO':
                    case 'WaitingForMatchPreview':
                    case 'WaitingForMatchPreviewTO':
                        this.frame.field = FieldState.PRESTART_COMPLETED;
                        this.frame.match = data.MatchNumber;
                        this.frame.play = data.PlayNumber;
                        this.frame.level = data.Level;

                        this.cycleTimeCallback('prestart', '');
                        break;
                    case 'WaitingForMatchReady':
                        this.frame.field = FieldState.MATCH_NOT_READY;
                        break;
                    case 'WaitingForMatchStart':
                        this.frame.field = FieldState.MATCH_READY;
                        break;
                    case 'GameSpecific':
                        // What?
                        // $(".matchState").removeClass("matchStateRed");
                        // $(".matchState").addClass("matchStateGreen");
                        // $("#matchStateTop").text("CLEARING GAME DATA");
                        // $("#matchStateBottom").text("FROM DS");
                        this.frame.field = FieldState.UNKNOWN;
                        break;
                    case 'MatchAuto':
                        this.frame.field = FieldState.MATCH_RUNNING_AUTO;
                        this.cycleTimeCallback('start', '');
                        break;
                    case 'MatchTransition':
                        this.frame.field = FieldState.MATCH_TRANSITIONING;
                        break;
                    case 'MatchTeleop':
                        this.frame.field = FieldState.MATCH_RUNNING_TELEOP;
                        break;
                    case 'WaitingForCommit':
                        this.frame.field = FieldState.MATCH_OVER;
                        this.cycleTimeCallback('end', '');
                        break;
                    case 'WaitingForPostResults':
                        this.frame.field = FieldState.READY_FOR_POST_RESULT;
                        this.cycleTimeCallback('scoresPosted', '');
                        await uploadMatchLogs();
                        break;
                    case 'TournamentLevelComplete':
                        this.frame.field = FieldState.UNKNOWN;
                        break;
                    case 'MatchCancelled':
                        this.frame.field = FieldState.MATCH_ABORTED;
                        await uploadMatchLogs();
                        // womp womp
                        break;
                }

                this.frame.match = data.MatchNumber;
            }
        );

        // Register listener for the "TeamInfoChanged" event (team connects, disconnects, etc)
        this.connection.on('fieldmonitordatachanged', async (data: SignalRMonitorFrame[]) => {
            for (let i = 0; i < data.length; i++) {
                const team: ROBOT = (((data[i].Alliance === "Red") ? 'red' : 'blue') + FMSEnums.StationType[data[i].Station]) as ROBOT;

                this.frame[team] = {
                    number: data[i].TeamNumber,
                    ds: this.dsState(data[i]),
                    radio: data[i].RadioLink,
                    rio: data[i].RIOLink,
                    code: data[i].LinkActive,
                    bwu: data[i].DataRateTotal,
                    battery: data[i].Battery,
                    ping: data[i].AverageTripTime,
                    packets: data[i].LostPackets,
                    MAC: data[i].MACAddress,
                    RX: data[i].RxRate,
                    RXMCS: data[i].RxMCS,
                    TX: data[i].TxRate,
                    TXMCS: data[i].TxMCS,
                    SNR: data[i].SNR,
                    noise: data[i].Noise,
                    signal: data[i].Signal,
                    versionmm: this.frame[team].versionmm ?? false,
                    enabled: this.enableState(data[i]),
                    radioConnected: data[i].RadioConnectedToAp ?? null,
                    radioConnectionQuality: data[i].RadioConnectionQuality ?? null,
                };
            }

            this.frame.frameTime = Date.now();
            this.callback(this.frame);
        });

        // Register listener for the "ScheduleAheadBehindChanged" event (how far ahead or behind the schedule is)
        this.connection.on('scheduleaheadbehindchanged', (data) => {
            this.frame.time = data;
        });

        // Register listener for the "RobotVersionDataChanged" event (robot version information)
        // No idea if this works, the field monitor's implementation made no sense
        this.connection.on('robotversiondatachanged', (data) => {
            console.log(data);

            /*
            // like wtf does this even do? would it not always be true if p3.length is greater than 0?
            var badVersion = false;
            for (var index = 0; index < robotVersionDataParam.p3.length; index++) {
                badVersion = true;
            }
            */

            //const team: ROBOT = (((data.p1 === FMSEnums.AllianceType.Red) ? 'red' : 'blue') + data.p2) as ROBOT;

            // if (data.p3) this.frame[team].versionmm = data.p3.length > 0;
            // else this.frame[team].versionmm = false;
        });

        // Any settings changed in FMS
        /**
         * Any settings changed in FMS
         * VideoSwitchOption
         * BackgroundVideoMessage (texted entered in match control page)
         * AutoTime, TeleopTime, TimeoutTime (match time changed in control page)
         * CurrentWizardStep
         * 
         */
        this.infrastructureConnection.on('systemconfigvaluechanged', (data) => {
            console.log('systemconfigvaluechanged: ', data);
        });

        this.infrastructureConnection.on('activetournamentlevelchanged', (data) => {
            console.log('activetournamentlevelchanged: ', data);
            this.sendScheduleCallback();
        });

        // Constant countdown timer 14-0 for auto then 135-0 for teleop
        // Also countdown for breaks during playoffs in seconds
        this.infrastructureConnection.on('matchtimerchanged', (data) => {
            //console.log('matchtimerchanged: ', data);
        });

        // 20 seconds left
        this.infrastructureConnection.on('matchtimerwarning1', (data) => {
            //console.log('matchtimerwarning1: ', data);
        });

        // 90 seconds left
        this.infrastructureConnection.on('matchtimerwarning2', (data) => {
            //console.log('matchtimerwarning2: ', data);
        });

        // 60 seconds left (intended for timeouts but also played during matches lol)
        this.infrastructureConnection.on('timeoutwarning1', (data) => {
            //console.log('timeoutwarning1: ', data);
        });

        this.infrastructureConnection.on('plc_status_changed', (data) => {
            console.log('plc_status_changed: ', data);
        });

        this.infrastructureConnection.on('plc_astop_status_requestupdate', (data) => {
            //console.log('plc_astop_status_requestupdate: ', data);
        });

        this.infrastructureConnection.on('plc_astop_status_changed', (data) => {
            console.log('plc_astop_status_changed: ', data);
        });

        this.infrastructureConnection.on('plc_estop_status_requestupdate', (data) => {
            //console.log('plc_estop_status_requestupdate: ', data);
        });

        this.infrastructureConnection.on('plc_estop_status_changed', (data) => {
            console.log('plc_estop_status_changed: ', data);
        });

        this.infrastructureConnection.on('plc_connection_status_requestupdate', (data) => {
            //console.log('plc_connection_status_requestupdate: ', data);
        });

        this.infrastructureConnection.on('plc_match_status_changed', (data) => {
            console.log('plc_match_status_changed: ', data);
            if (data.RefDone) {
                this.cycleTimeCallback('refsDone', '');
            }
        });

        this.infrastructureConnection.on('matchstatusinfochanged', (data) => {
            console.log('matchstatusinfochanged: ', data);
        });

        this.infrastructureConnection.on('fieldnetworkstatus', (data) => {
            //console.log('fieldnetworkstatus: ', data);
        });

        this.infrastructureConnection.on('plc_io_status_changed', (data) => {
            //console.log('plc_io_status_changed: ', data);
        });

        this.infrastructureConnection.on('matchstatuschanged', (data) => {
            console.log('matchstatuschanged: ', data);

        });

        // BackupPerformed_Incremental when score committed
        // BackupPerformed_Full
        this.infrastructureConnection.on('backupprogress', (data) => {
            //console.log('backupprogress: ', data);
        });

        this.infrastructureConnection.on('audienceshowmatchresult', (data) => {
            //console.log('audienceshowmatchresult: ', data);
        });

        this.infrastructureConnection.on('lastcycletimecalculated', (data) => {
            console.log('lastcycletimecalculated: ', data);
            this.frame.lastCycleTime = data;
            this.cycleTimeCallback('lastCycleTime', data);
        });

        this.infrastructureConnection.on('scheduleaheadbehindchanged', (data) => {
            console.log('scheduleaheadbehindchanged: ', data);
            this.frame.time = data;
        });

        // Register connected/disconnected events
        this.connection.onreconnecting(() => {
            console.log('SignalR Connection Lost, Reconnecting');
        });

        this.connection.onclose(() => {
            console.log('SignalR FMS Connection Closed!');
        });

        // Register connected/disconnected events
        this.infrastructureConnection.onreconnecting(() => {
            console.log('SignalR Connection Lost, Reconnecting');
        });

        this.infrastructureConnection.onclose(() => {
            console.log('SignalR FMS Connection Closed!');
        });

        this.gameSpecificConnection.on('BlueScoreChanged', (data) => {
            //console.log('BlueScoreChanged: ', data)
        });
        this.gameSpecificConnection.on('RedScoreChanged', (data) => {
            //console.log('RedScoreChanged: ', data)
        });
        this.gameSpecificConnection.on('BlueScoringElementsChanged', (data) => {
            //console.log('BlueScoringElementsChanged: ', data)
        });
        this.gameSpecificConnection.on('RedScoringElementsChanged', (data) => {
            //console.log('RedScoringElementsChanged: ', data)
        });
        this.gameSpecificConnection.on('fieldtestelements_changed', (data) => console.log('fieldtestelements_changed: ', data));

        // Start connection to SignalR Hub
        return Promise.all([this.infrastructureConnection.start(), this.connection.start(), this.gameSpecificConnection.start()]).catch(console.log);
    }

    /**
    * This function is used to invoke a SignalR event and wait for a response.
    * @param eventName The name of the event to invoke
    * @param eventResponse The name of the event to listen for the response
    * @param args Any arguments to pass to the event
    * @returns A promise that resolves with the response from the event
    */
    private invokeExpectResponse<t>(eventName: string, eventResponse: string, ...args: any[]): Promise<t> {
        return new Promise<t>((resolve, reject) => {
            if (this.infrastructureConnection == null) {
                reject();
                return;
            }

            const listener = (response: t) => {
                this.infrastructureConnection?.off(eventResponse, listener);
                resolve(response);
            };
            this.infrastructureConnection.on(eventResponse, listener);

            this.infrastructureConnection.invoke(eventName, ...args).catch((err) => {
                console.error(`Failed to invoke '${eventName}'`, err);
                reject(err);
            });
        });
    }

    private dsState(data: SignalRMonitorFrame): DSState {
        if (data.IsBypassed) return DSState.BYPASS;
        if (data.IsEStopped) return DSState.ESTOP;
        if (data.IsAStopped && this.frame.field == FieldState.MATCH_RUNNING_AUTO) return DSState.ASTOP;
        if (data.Connection) {
            console.log(data.StationStatus);
            if (data.DSLinkActive) return DSState.GREEN;
            if (data.StationStatus === 'WrongStation') return DSState.MOVE_STATION;
            if (data.StationStatus === 'Waiting') return DSState.WAITING;
            return DSState.GREEN_X;
        }

        return DSState.RED;
    }

    private enableState(data: SignalRMonitorFrame): EnableState {
        if (data.IsEStopped) return EnableState.ESTOP;
        if (data.IsAStopPressed) return EnableState.ASTOP;
        if (data.IsEnabled) {
            if (data.IsAuto) return EnableState.GREEN_A;
            return EnableState.GREEN_T;
        }
        return EnableState.RED;
    }
}

