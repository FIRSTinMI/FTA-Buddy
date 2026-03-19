[Home](./)

# Station Logs

A station log is the detailed DS connection record for one robot in one match. It shows second-by-second data for every metric FMS tracks.

Navigate to a station log by opening a match from the [Match Logs list](./index) and tapping a station.

---

## Metrics

| Metric                | Description                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Battery**           | Robot battery voltage (volts). Values below ~11V may indicate brownouts.                                            |
| **Ping**              | Round-trip time between FMS and the robot (ms). High ping indicates network congestion or distance issues.          |
| **Signal**            | WiFi signal strength at the field access point (dBm). Lower (more negative) values = weaker signal.                 |
| **SNR**               | Signal-to-Noise Ratio (dB). Higher is better. Low SNR in a noisy RF environment causes packet loss.                 |
| **Data Rate (TX/RX)** | Bandwidth used in each direction (Mbps). High TX from the robot may indicate vision streaming or excessive logging. |
| **MCS**               | Modulation and Coding Scheme index. Higher MCS = faster WiFi link rate, but requires better signal quality.         |
| **Packet Loss**       | Number of lost packets. Any non-zero value during a match is worth investigating.                                   |
| **DS Link**           | Whether the Driver Station had a valid link to FMS at each second.                                                  |
| **Radio Link**        | Whether the robot's radio was connected to the field AP at each second.                                             |
| **RIO Link**          | Whether the roboRIO was communicating at each second.                                                               |
| **Code**              | Whether robot code was running at each second.                                                                      |
| **Enabled**           | Whether the robot was enabled during auto or teleop.                                                                |
| **Brownout**          | Whether the robot triggered a brownout protection event.                                                            |

---

## Graph Interactions

The station log page displays interactive graphs for battery, signal strength, data rates, and packet loss across the full match timeline. You can:

- **Pan** the graph to focus on specific moments.
- **Zoom** to see finer detail around a disconnect or brownout event.
- Lines for **auto** and **teleop** periods are marked on the timeline.

---

## Exporting to CSV

Tap the **Export CSV** button to download the raw log data as a comma-separated file. The CSV includes every second of the match for all tracked metrics, making it easy to analyze in a spreadsheet.

---

## Sharing a Log

Tap the **Share** button to generate a public link for this station log. The link:

- Does **not** require an FTA Buddy account to view.
- Expires after the event ends.
- Can be shared with teams, mentors, or other volunteers.

A **QR code** is also displayed so you can hold your phone up for someone to scan directly.

The share URL follows this format:

```
https://ftabuddy.com/logs/[matchId]/[shareCode]
```

Public log links can also be accessed via the [Public API](../api/).
