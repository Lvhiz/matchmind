import * as dotenv from "dotenv";
import * as path from "path";
import cron from "node-cron";
import { startPolling } from "./poller";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function runOracleCycle(): Promise<void> {
  // TODO: fetch fixtures, call Anthropic, submit on-chain predictions
  console.log("[MatchMind Agent] Oracle cycle — not yet implemented");
}

console.log("[MatchMind Agent] Starting oracle agent…");

startPolling((state) => {
  console.log(
    `[poller] ${state.homeTeam} ${state.score.home}-${state.score.away} ${state.awayTeam} (${state.elapsed}')`
  );
});

runOracleCycle().catch(console.error);
cron.schedule("0 */6 * * *", () => {
  runOracleCycle().catch(console.error);
});
