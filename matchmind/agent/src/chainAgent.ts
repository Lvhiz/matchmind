import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import logger from "./logger";
import type { MatchState } from "./poller";

type Address = `0x${string}`;

type DeploymentAddresses = {
  factory?: Address;
  oracleRelayer?: Address;
  usdt?: Address;
};

type StoredMarket = {
  address: Address;
  question: string;
  expiry: number;
  reasoning: string;
  matchContext: MatchState;
  resolved: boolean;
};

type MatchEvent = MatchState["recentEvents"][number];

const MIN_OKB_BALANCE = ethers.parseEther("0.005");
const SHARED_DIR = path.resolve(__dirname, "../../shared");
const DEPLOYMENTS_PATH = path.join(SHARED_DIR, "deployments.json");
const ABIS_DIR = path.join(SHARED_DIR, "abis");

const rpcUrl = process.env.XLAYER_MAINNET_RPC;
const privateKey = process.env.AGENT_PRIVATE_KEY;

export const provider = new ethers.JsonRpcProvider(rpcUrl);
export const wallet = createWallet();

const deployments = loadDeployments();
const addresses = normalizeDeploymentAddresses(deployments);
const factoryAbi = loadAbi("factory", [
  "Factory.json",
  "MarketFactory.json",
  "MatchMindFactory.json",
  "PredictionMarketFactory.json",
]);
const oracleRelayerAbi = loadAbi("oracleRelayer", [
  "OracleRelayer.json",
  "MatchMindOracleRelayer.json",
]);
const usdtAbi = loadAbi("USDT", ["USDT.json", "ERC20.json", "IERC20.json"]);

const factory =
  wallet && addresses.factory && factoryAbi
    ? new ethers.Contract(addresses.factory, factoryAbi, wallet)
    : undefined;

const oracleRelayer =
  wallet && addresses.oracleRelayer && oracleRelayerAbi
    ? new ethers.Contract(addresses.oracleRelayer, oracleRelayerAbi, wallet)
    : undefined;

const usdt =
  wallet && addresses.usdt && usdtAbi
    ? new ethers.Contract(addresses.usdt, usdtAbi, wallet)
    : undefined;

const openMarkets = new Map<string, StoredMarket>();

void logStartupBalances().catch((error) => {
  logger.error("[chainAgent] Unhandled startup balance check failure:", error);
});

export async function openMarket(
  question: string,
  windowMinutes: number,
  reasoning: string,
  matchState: MatchState
): Promise<Address | null> {
  try {
    if (!factory) {
      logger.error("[chainAgent] Factory contract is not configured; skipping openMarket");
      return null;
    }

    if (!(await hasEnoughOkbForTx("openMarket"))) {
      return null;
    }

    const expiryTimestamp = Math.floor(Date.now() / 1000) + windowMinutes * 60;
    const tx = (await factory.createMarket(
      question,
      expiryTimestamp,
      2
    )) as ethers.ContractTransactionResponse;

    const receipt = await tx.wait(2);
    const marketAddress = receipt ? await getCreatedMarketAddress(receipt) : null;

    if (!marketAddress) {
      logger.error(
        `[chainAgent] createMarket tx confirmed but market address could not be determined | tx: ${tx.hash}`
      );
      return null;
    }

    openMarkets.set(marketAddress.toLowerCase(), {
      address: marketAddress,
      question,
      expiry: expiryTimestamp,
      reasoning,
      matchContext: cloneMatchState(matchState),
      resolved: false,
    });

    logger.info(` Market opened: ${question} | expires in ${windowMinutes}m | tx: ${tx.hash}`);
    return marketAddress;
  } catch (error) {
    logger.error("[chainAgent] openMarket failed:", error);
    return null;
  }
}

export async function resolveMarket(marketAddress: string, outcome: boolean): Promise<boolean> {
  try {
    if (!oracleRelayer) {
      logger.error("[chainAgent] Oracle relayer contract is not configured; skipping resolveMarket");
      return false;
    }

    if (!wallet) {
      logger.error("[chainAgent] Agent wallet is not configured; skipping resolveMarket");
      return false;
    }

    if (!ethers.isAddress(marketAddress)) {
      logger.error(`[chainAgent] Invalid market address: ${marketAddress}`);
      return false;
    }

    if (!(await hasEnoughOkbForTx("resolveMarket"))) {
      return false;
    }

    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "bool"],
      [marketAddress, outcome]
    );
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));
    const tx = (await oracleRelayer.resolveMarket(
      marketAddress,
      outcome,
      signature
    )) as ethers.ContractTransactionResponse;

    const receipt = await tx.wait(2);
    if (!receipt) {
      logger.error(`[chainAgent] resolveMarket tx did not return a receipt: ${tx.hash}`);
      return false;
    }

    const stored = openMarkets.get(marketAddress.toLowerCase());
    if (stored) {
      stored.resolved = true;
    }

    logger.info(`✅ Resolved ${marketAddress} → ${outcome ? "YES" : "NO"} | tx: ${tx.hash}`);
    return true;
  } catch (error) {
    logger.error(`[chainAgent] resolveMarket failed for ${marketAddress}:`, error);
    return false;
  }
}

export async function checkAndResolveExpired(currentMatchState: MatchState): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiredMarkets = Array.from(openMarkets.values()).filter(
      (market) => !market.resolved && market.expiry <= now
    );

    for (const market of expiredMarkets) {
      const outcome = determineOutcome(market, currentMatchState);

      if (outcome === undefined) {
        logger.warn(`[chainAgent] WARNING: Ambiguous expired market skipped: ${market.question}`);
        continue;
      }

      await resolveMarket(market.address, outcome);
    }
  } catch (error) {
    logger.error("[chainAgent] checkAndResolveExpired failed:", error);
  }
}

export function getOpenMarketQuestions(): string[] {
  return Array.from(openMarkets.values())
    .filter((market) => !market.resolved)
    .map((market) => market.question);
}

async function logStartupBalances(): Promise<void> {
  try {
    if (!rpcUrl) {
      logger.warn("[chainAgent] WARNING: XLAYER_MAINNET_RPC is not set");
    }

    if (!wallet) {
      logger.warn("[chainAgent] WARNING: AGENT_PRIVATE_KEY is not set");
      return;
    }

    const okbBalance = await provider.getBalance(wallet.address);
    const usdtBalance = usdt ? await getUsdtBalance(wallet.address) : "USDT contract unavailable";

    logger.info(`[chainAgent] Agent wallet: ${wallet.address}`);
    logger.info(`[chainAgent] OKB balance: ${ethers.formatEther(okbBalance)} OKB`);
    logger.info(`[chainAgent] USDT balance: ${usdtBalance}`);
  } catch (error) {
    logger.error("[chainAgent] Startup balance check failed:", error);
  }
}

function createWallet(): ethers.Wallet | undefined {
  if (!privateKey) {
    return undefined;
  }

  try {
    return new ethers.Wallet(privateKey, provider);
  } catch (error) {
    logger.error("[chainAgent] Invalid AGENT_PRIVATE_KEY; wallet disabled:", error);
    return undefined;
  }
}

async function hasEnoughOkbForTx(action: string): Promise<boolean> {
  try {
    if (!wallet) {
      logger.error(`[chainAgent] Agent wallet is not configured; skipping ${action}`);
      return false;
    }

    const balance = await provider.getBalance(wallet.address);
    if (balance < MIN_OKB_BALANCE) {
      logger.warn(
        `WARNING: Agent OKB balance is ${ethers.formatEther(
          balance
        )} OKB, below 0.005 OKB. Skipping ${action}.`
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`[chainAgent] Could not check OKB balance before ${action}:`, error);
    return false;
  }
}

async function getUsdtBalance(address: string): Promise<string> {
  if (!usdt) {
    return "USDT contract unavailable";
  }

  const rawBalance = (await usdt.balanceOf(address)) as bigint;
  let decimals = 6;

  try {
    decimals = Number(await usdt.decimals());
  } catch {
    decimals = 6;
  }

  return `${ethers.formatUnits(rawBalance, decimals)} USDT`;
}

async function getCreatedMarketAddress(
  receipt: ethers.TransactionReceipt
): Promise<Address | null> {
  const fromLogs = extractMarketAddressFromLogs(receipt);
  if (fromLogs) {
    return fromLogs;
  }

  return getLatestFactoryMarketAddress();
}

function extractMarketAddressFromLogs(receipt: ethers.TransactionReceipt): Address | null {
  if (!factory) {
    return null;
  }

  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });

      if (!parsed) {
        continue;
      }

      const namedAddress = findNamedAddress(parsed.args);
      if (namedAddress) {
        return namedAddress;
      }

      const positionalAddress = findPositionalAddress(parsed.args);
      if (positionalAddress) {
        return positionalAddress;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function findNamedAddress(args: ethers.Result): Address | null {
  const candidateKeys = ["market", "marketAddress", "predictionMarket", "addr"];

  for (const key of candidateKeys) {
    let value: unknown;

    try {
      value = args.getValue(key);
    } catch {
      continue;
    }

    if (typeof value === "string" && isUsableContractAddress(value)) {
      return value;
    }
  }

  return null;
}

function findPositionalAddress(args: ethers.Result): Address | null {
  const excluded = new Set(
    [wallet?.address, addresses.factory, addresses.oracleRelayer, addresses.usdt]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
  );

  for (const value of args.toArray()) {
    if (typeof value === "string" && isUsableContractAddress(value)) {
      const normalized = value.toLowerCase();
      if (!excluded.has(normalized)) {
        return value as Address;
      }
    }
  }

  return null;
}

async function getLatestFactoryMarketAddress(): Promise<Address | null> {
  if (!factory) {
    return null;
  }

  try {
    const markets = (await factory.getMarkets()) as string[];
    const latest = markets[markets.length - 1];
    return latest && ethers.isAddress(latest) ? (latest as Address) : null;
  } catch {
    // Continue through known factory read patterns.
  }

  try {
    const count = (await factory.marketCount()) as bigint;
    if (count === 0n) {
      return null;
    }

    const latest = (await factory.markets(count - 1n)) as string;
    return ethers.isAddress(latest) ? (latest as Address) : null;
  } catch {
    return null;
  }
}

function determineOutcome(market: StoredMarket, currentMatchState: MatchState): boolean | undefined {
  const question = market.question.toLowerCase();
  const opening = market.matchContext;
  const homeTeam = currentMatchState.homeTeam || opening.homeTeam;
  const awayTeam = currentMatchState.awayTeam || opening.awayTeam;
  const home = homeTeam.toLowerCase();
  const away = awayTeam.toLowerCase();
  const homeScore = currentMatchState.score.home;
  const awayScore = currentMatchState.score.away;

  if (question.includes(home) && (question.includes("beat") || question.includes("win"))) {
    return homeScore > awayScore;
  }

  if (question.includes(away) && (question.includes("beat") || question.includes("win"))) {
    return awayScore > homeScore;
  }

  if (question.includes("both teams") && question.includes("score")) {
    return homeScore > 0 && awayScore > 0;
  }

  if (question.includes("goal") || question.includes("score")) {
    const openingGoals = opening.score.home + opening.score.away;
    const currentGoals = homeScore + awayScore;
    return currentGoals > openingGoals;
  }

  if (question.includes("yellow")) {
    return getEventsSinceOpening(market, currentMatchState).some((event) =>
      event.type.toLowerCase().includes("yellow")
    );
  }

  if (question.includes("shot")) {
    return (
      currentMatchState.shotsOnTarget.home + currentMatchState.shotsOnTarget.away >
      opening.shotsOnTarget.home + opening.shotsOnTarget.away
    );
  }

  return undefined;
}

function getEventsSinceOpening(market: StoredMarket, currentMatchState: MatchState): MatchEvent[] {
  return currentMatchState.recentEvents.filter(
    (event) => event.minute >= market.matchContext.elapsed && event.minute <= currentMatchState.elapsed
  );
}

function cloneMatchState(matchState: MatchState): MatchState {
  return {
    ...matchState,
    score: { ...matchState.score },
    possession: { ...matchState.possession },
    shotsOnTarget: { ...matchState.shotsOnTarget },
    xG: { ...matchState.xG },
    recentEvents: matchState.recentEvents.map((event) => ({ ...event })),
    lastUpdated: new Date(matchState.lastUpdated),
  };
}

function loadDeployments(): unknown {
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    logger.warn(`[chainAgent] WARNING: deployments file missing at ${DEPLOYMENTS_PATH}`);
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8")) as unknown;
  } catch (error) {
    logger.error("[chainAgent] Failed to read deployments.json:", error);
    return {};
  }
}

function normalizeDeploymentAddresses(deploymentData: unknown): DeploymentAddresses {
  const scope = getDeploymentScope(deploymentData);

  return {
    factory: getAddress(scope, ["factory", "marketFactory", "matchMindFactory", "FACTORY"]),
    oracleRelayer: getAddress(scope, [
      "oracleRelayer",
      "relayer",
      "oracle",
      "ORACLE_RELAYER",
    ]),
    usdt: getAddress(scope, ["usdt", "USDT", "token", "paymentToken", "TOKEN"]),
  };
}

function getDeploymentScope(deploymentData: unknown): Record<string, unknown> {
  if (!isRecord(deploymentData)) {
    return {};
  }

  const candidates = ["xlayerMainnet", "xLayerMainnet", "xlayer", "mainnet", "196"];
  for (const key of candidates) {
    const value = deploymentData[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return deploymentData;
}

function getAddress(scope: Record<string, unknown>, keys: string[]): Address | undefined {
  for (const key of keys) {
    const value = scope[key];
    if (typeof value === "string" && ethers.isAddress(value)) {
      return value as Address;
    }
  }

  return undefined;
}

function loadAbi(role: string, candidateFiles: string[]): ethers.InterfaceAbi | undefined {
  if (!fs.existsSync(ABIS_DIR)) {
    logger.warn(`[chainAgent] WARNING: ABI folder missing at ${ABIS_DIR}`);
    return undefined;
  }

  for (const fileName of candidateFiles) {
    const abiPath = path.join(ABIS_DIR, fileName);
    if (!fs.existsSync(abiPath)) {
      continue;
    }

    try {
      const artifact = JSON.parse(fs.readFileSync(abiPath, "utf8")) as unknown;
      const abi = extractAbi(artifact);
      if (abi) {
        return abi;
      }
    } catch (error) {
      logger.error(`[chainAgent] Failed to load ${role} ABI from ${abiPath}:`, error);
      return undefined;
    }
  }

  logger.warn(
    `[chainAgent] WARNING: No ${role} ABI found in ${ABIS_DIR}. Tried: ${candidateFiles.join(", ")}`
  );
  return undefined;
}

function extractAbi(artifact: unknown): ethers.InterfaceAbi | undefined {
  if (Array.isArray(artifact)) {
    return artifact as ethers.InterfaceAbi;
  }

  if (isRecord(artifact) && Array.isArray(artifact.abi)) {
    return artifact.abi as ethers.InterfaceAbi;
  }

  return undefined;
}

function isUsableContractAddress(value: string): value is Address {
  return ethers.isAddress(value) && value !== ethers.ZeroAddress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
