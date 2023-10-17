# Local server API

<details>
 <summary><code>GET</code> <code><b>/monitor</b></code> <code>(Get last monitor data frame)</code></summary>

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
 <summary><code>POST</code> <code><b>/monitor</b></code> <code>(Post new monitor data and send to websocket subscribers)</code></summary>

See the `GET` stub for what the body of the request should look like, make sure top set `content-type` header to `application/json`.

</details>