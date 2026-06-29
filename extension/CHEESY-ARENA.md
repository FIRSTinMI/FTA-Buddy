# Cheesy Arena source

FTA Buddy can read a [Cheesy Arena](https://github.com/Team254/cheesy-arena) field instead of
official FMS. Pick the field system in the host wizard's **Extension Setup** step (or set
`sourceMode` / `cheesyHost` in extension storage). FMS remains the default; nothing changes for FMS
events.

## How it works

The extension has a pluggable field data **source** (`extension/src/sources/`). Both sources emit the
same `frame` / `cycleTime` / `sendSchedule` events and expose the same REST lookups, so
`background.ts` treats them identically and the server, app, and database are untouched.

- `FmsSource` — official FMS over SignalR (`signalR.ts`) plus the FMS REST API (`fmsapi.ts`).
- `CheesyArenaSource` — subscribes to Cheesy Arena's `/api/arena/websocket` notifier stream and maps
  it onto the same model. REST lookups hit Cheesy Arena's `/api/matches/...` endpoints.

### Data mapping (`cheesyArenaMap.ts`)

| FTA Buddy field | Cheesy Arena source |
| --- | --- |
| DS state | `Bypass`/`EStop`/`AStop`/`DsLinked`/`WrongStation` on the alliance station + DsConn |
| radio / rio / code | `DsConn.RadioLinked` / `RioLinked` / `RobotLinked` |
| enabled | `DsConn.Enabled` + `Auto` (e-stop / a-stop override) |
| battery / ping / packets | `DsConn.BatteryVoltage` / `DsRobotTripTimeMs` / `MissedPacketCount` |
| bandwidth / RX / TX / SNR | `WifiStatus.MBits` / `RxRate` / `TxRate` / `SignalNoiseRatio` |
| radio quality | `WifiStatus.ConnectionQuality` (1-4) |
| field state | `arenaStatus.MatchState` + `CanStartMatch`, with `matchLoad` = prestart and `scorePosted` = post-result |

Match logs are accumulated live from the 2 Hz `arenaStatus` stream (Cheesy Arena has no FMS-style
`GetLog`) and uploaded at match end with a deterministic synthetic `fmsMatchId`.

### Cross-origin websocket

Cheesy Arena's websocket uses gorilla/websocket's default same-origin check, which rejects the
extension's `Origin: chrome-extension://<id>` header. The extension uses a `declarativeNetRequest`
session rule (`cheesyOriginRule.ts`) to strip the Origin header on the websocket upgrade to the
configured Cheesy Arena host, so the check passes. No Cheesy Arena change is required. This needs the
`declarativeNetRequestWithHostAccess` permission and host access to the Cheesy Arena host.

> The default `cheesyHost` is `10.0.100.5:8080`, covered by the existing `http://10.0.100.5/*` host
> permission (match patterns ignore the port). If Cheesy Arena runs on a different host, add that host
> to the extension's `host_permissions`.

## Known limitations

Cheesy Arena does not track everything FMS does, so these degrade gracefully:

- No signal/noise dBm, MAC address, or MCS indices (the corresponding graphs/columns are empty).
- No DS/firmware version data, so version-mismatch warnings never fire.
- No `GREEN_X` / `WAITING` DS sub-states — a linked DS shows green.
- No FMS notes / FTA-app two-way sync (FMS only).
- Schedule ahead/behind and bandwidth-utilization category are approximated from Cheesy Arena's
  `eventStatus` and `MBits`.
