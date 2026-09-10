// Run one Slack corpus poll pass and exit. For manual/admin triggering outside the scheduler
// (which follows the seasonal cadence). Needs the same env as the server (DB_*, REDIS_URL).
import "dotenv/config";
import { connect } from "../db/db";
import { runSlackPollPass } from "../util/troubleshoot/slack-poller";

await connect();
const stats = await runSlackPollPass();
console.log("STATS " + JSON.stringify(stats));
process.exit(0);
