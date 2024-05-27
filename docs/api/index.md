# FTA Buddy Public API

Base URL: `https://ftabuddy.com/api`

- [Match Logs](#match-logs)
- [Cycle Times](#cycle-logs)

## Match Logs

### `GET /logs/:shareID`

Get the match logs for a given share ID.

#### Parameters

- `shareID` (string): The share ID to get the logs for.

#### Query Parameters

- `format` (string): The format to return the logs in. Can be either `json` or `csv`. Defaults to `csv`.

#### Response

```json
{
	"team": 1,
	"matchID": "f04cf723-6a4a-4e2a-9361-aa09c320c456",
	"event": "2024milan",
	"level": "None",
	"matchNumber": 999,
	"playNumber": 1,
	"station": "blue1",
	"expires": "2024-05-28T04:38:48.313Z",
	"matchStartTime": "2024-05-08T19:34:36.653Z",
	"log": [
		{
			"auto": true,
			"teleop": false,
			"battery": 12.62109375,
			"enabled": true,
			"rioLink": true,
			"brownout": false,
			"matchTime": 15,
			"radioLink": true,
			"timeStamp": "2024-05-08T20:04:35",
			"linkActive": true,
			"lostPackets": 0,
			"sentPackets": 0,
			"aStopPressed": false,
			"dsLinkActive": true,
			"eStopPressed": false,
			"dataRateTotal": 2,
			"matchTimeBase": 0,
			"averageTripTime": 3.5
		},
        ...
    ]
}
```

## Cycle Logs

### `GET /cycles/:eventCode`

Get the cycle time information for a given event.

#### Parameters

- `eventCode` (string): The event code, e.g. `2024milan`.

#### Response

```json
[
	{
        "id": "637a23ba-92cb-45d3-bb85-c3261b7b755e",
        "event": "2024milan",
        "match_number": 4,
        "play_number": 1,
        "level": "Qualification",
        "prestart_time": "2024-05-18T06:25:37.841Z",
        "start_time": "2024-05-18T06:25:50.144Z",
        "calculated_cycle_time": "00:04:54.3739135",
        "ref_done_time": "2024-05-18T06:28:20.700Z",
        "scores_posted_time": "2024-05-18T06:29:03.339Z",
        "end_time": "2024-05-18T06:28:20.737Z"
	},
    ...
]
```

### `GET /cycles/:eventCode/:level/:match/:play`

Get the cycle time information for a given match.

#### Parameters

- `eventCode` (string): The event code, e.g. `2024milan`.
- `level` (string): The level, `None`, `Practice`, `Qualification`, or `Playoff`.
- `match` (number): The match number to get the cycles for.
- `play` (number): The play number to get the cycles for.

#### Response

```json
{
	"id": "637a23ba-92cb-45d3-bb85-c3261b7b755e",
	"event": "2024milan",
	"match_number": 4,
	"play_number": 1,
	"level": "Qualification",
	"prestart_time": "2024-05-18T06:25:37.841Z",
	"start_time": "2024-05-18T06:25:50.144Z",
	"calculated_cycle_time": "00:04:54.3739135",
	"ref_done_time": "2024-05-18T06:28:20.700Z",
	"scores_posted_time": "2024-05-18T06:29:03.339Z",
	"end_time": "2024-05-18T06:28:20.737Z"
}
```

### `GET /team-average-cycle/:team/:eventCode?`

Get the average cycle time for a given team (optionally filtered to a specific event.)

#### Parameters

- `team` (number): The team number to get the average cycle time for.
- `eventCode` (string): The event code to filter the average cycle time to.

```json
{
	"ds": 10000,
	"radio": 55000,
	"rio": 67000,
	"code": 69000
}
```
