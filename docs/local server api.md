# Local server API

## Registering Event

<details>
 <summary><code>GET</code> <code><b>/register/:event</b></code> <code>(Get ip address of local server for event)</code></summary>

##### Responses

| HTTP Code     | Response       |
| ------------- | -------------- |
| `200`         | `192.168.1.30` |
| `404`         |  None          |

</details>

<details>
 <summary><code>POST</code> <code><b>/register/:event</b></code> <code>(Set ip address of local server for event)</code></summary>

##### Parameters

| Name  | Description    |
| ----- | -------------- |
| event | The event code |

##### Body 

```json
{
    ip: "192.168.1.30"
}
```

##### Responses

| HTTP Code     | Response       |
| ------------- | -------------- |
| `200`         | None           |

</details>

## Team List

<details>
 <summary><code>GET</code> <code><b>/teams/:event</b></code> <code>(Get list of teams at event)</code></summary>

##### Responses

| HTTP Code | Response                 |
| --------- | ------------------------ |
| `200`     | `["4384", "8728", ... ]` |

</details>

<details>
 <summary><code>POST</code> <code><b>/teams/:event</b></code> <code>(Post list of teams at event)</code></summary>

##### Parameters

| Name  | Description    |
| ----- | -------------- |
| event | The event code |

##### Body 

```json
{
    teams: ["4384", "8728", ... ]
}
```

##### Responses

| HTTP Code     | Response       |
| ------------- | -------------- |
| `200`         | None           |

</details>

## Field Monitor

<details>
 <summary><code>GET</code> <code><b>/monitor/:event</b></code> <code>(Get last monitor data frame)</code></summary>

##### Parameters

| Name  | Description    |
| ----- | -------------- |
| event | The event code |

##### Responses

This stub will always return a field monitor data frame even if it has never recieved one from the extension. In that case it would return a default data frame.

Generally a `0` represents a no connection status, or a red square on the field monitor
A `1` represents a good status, or green circle

The Field and DS fields have specific status codes

**DS**
| Code | Status                     |
| ---- | -------------------------- |
| 0    | No connection              |
| 1    | Connected                  |
| 2    | Ethernet connected, no FMS |
| 3    | Station mismatch           |
| 4    | Wrong match                |
| 5    | Bypassed                   |
| 6    | EStopped                   |

**Field**
| Code | Status               |
| ---- | -------------------- |
| 0    | Unknown              |
| 1    | Match running teleop |
| 2    | Match running auto   |
| 3    | Match ready          |
| 4    | Pre-start completed  |
| 5    | Ready to pre-start   |
| 6    | Match aborted        |
| 7    | Match over           |

```json
{
    field: 1,
    match: "54",
    time: "18 minutes behind",
    blue1: {
        number: "4384",
        ds: 1,
        radio: 0,
        rio: 0,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0
    },
    blue2: { ... },
    blue3: { ... },
    red1: { ... },
    red2: { ... },
    red3: { ... }
}
```

</details>

<details>
 <summary><code>POST</code> <code><b>/monitor/:event</b></code> <code>(Post new monitor data and send to websocket subscribers)</code></summary>

For regular updates the websocket is used, this is here just in case it may be needed.

##### Parameters

| Name  | Description    |
| ----- | -------------- |
| event | The event code |

See the `GET` stub for what the body of the request should look like, make sure top set `content-type` header to `application/json`.


</details>

## Profile

<details>
 <summary><code>POST</code> <code><b>/profile</b></code> <code>(Create profile for notes)</code></summary>

##### Body 

```json
{
    username: "Filip"
}
```

##### Responses

| HTTP Code     | Response                              |
| ------------- | ------------------------------------- |
| `200`         | 10 *The profile id*                   |
| `400`         | `{error: "Username already in use" }` |

</details>

## Notes

<details>
 <summary><code>GET</code> <code><b>/messages/:team</b></code> <code>(Get the notes for a team)</code></summary>

##### Response

```json
[
    {
        id: 3,
        profile: 10,
        event: "2023mitry",
        team: 4384,
        message: "Hello, world!",
        created: "2023-10-16T02:17:21.000Z",
        username: "Filip"
    }
]
```

</details>

<details>
 <summary><code>POST</code> <code><b>/messages/:team</b></code> <code>(Post note for a team)</code></summary>

##### Parameters

| Name | Description |
| ---- | ----------- |
| team | Team number |

##### Body 

```json
{
    event: "2023mitry",
    profile: 10,
    message: "Hello, world!"
}
```

##### Responses

| HTTP Code     | Response                      |
| ------------- | ----------------------------- |
| `200`         | *message object see GET stub* |
| `500`         | *error message*               |

</details>