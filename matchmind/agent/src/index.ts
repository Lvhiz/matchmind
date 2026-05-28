import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { startPolling, MatchState } from "./poller";
import { generateMarkets } from "./marketGenerator";
import {
  openMarket,
  checkAndResolveExpired,
  getOpenMarketQuestions,
} from "./chainAgent";
import logger from "./logger";

const DEPLOYMENTS_PATH = path.resolve(__dirname, "../../shared/deployments.json");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let isProcessing = false;
let resolvedMarkets = 0;

runStartupChecks();

process.on("SIGINT", () => {
  logger.info(" Agent shutting down");
  process.exit(0);
});

logger.info("[agent] Starting MatchMind orchestration loop");

startPolling((state) => {
  void handleMatchState(state).catch((error) => {
    logger.error("[agent] Unhandled poll cycle failure:", error);
  });
});

async function handleMatchState(state: MatchState): Promise<void> {
  if (isProcessing) {
    logger.warn("[agent] Previous poll cycle still running; skipping this update");
    return;
  }

  isProcessing = true;

  try {
    const openBeforeResolve = getOpenMarketQuestions().length;

    await checkAndResolveExpired(state);

    const openQuestions = getOpenMarketQuestions();
    resolvedMarkets += Math.max(0, openBeforeResolve - openQuestions.length);

    const suggestions = await generateMarkets(state, openQuestions);

    for (let i = 0; i < suggestions.length; i += 1) {
      const suggestion = suggestions[i];

      logger.info(`[market] ${suggestion.question} | reasoning: ${suggestion.reasoning}`);

      await openMarket(
        suggestion.question,
        suggestion.windowMinutes,
        suggestion.reasoning,
        state
      );

      if (i < suggestions.length - 1) {
        await sleep(3000);
      }
    }

    const openMarketCount = getOpenMarketQuestions().length;
    logger.info(
      ` Status: ${openMarketCount} open markets | ${resolvedMarkets} resolved | minute ${state.elapsed} | ${state.score.home}-${state.score.away}`
    );
  } catch (error) {
    logger.error("[agent] Poll cycle failed:", error);
  } finally {
    isProcessing = false;
  }
}

function runStartupChecks(): void {
  let hasFailure = false;

  if (!process.env.AGENT_PRIVATE_KEY) {
    logger.error("[startup] AGENT_PRIVATE_KEY is not set");
    hasFailure = true;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn("[startup] ANTHROPIC_API_KEY is not set — using fallback market generator");
  }

  if (!process.env.XLAYER_MAINNET_RPC) {
    logger.error("[startup] XLAYER_MAINNET_RPC is not set");
    hasFailure = true;
  }

  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    logger.error(`[startup] shared/deployments.json not found at ${DEPLOYMENTS_PATH}`);
    hasFailure = true;
  }

  if (hasFailure) {
    process.exit(1);
  }
}
