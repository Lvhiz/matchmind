import deployments from "../../shared/deployments.json";
import factoryAbiJson from "../../shared/abis/MarketFactory.json";
import predictionMarketAbiJson from "../../shared/abis/PredictionMarket.json";
import oracleRelayerAbiJson from "../../shared/abis/OracleRelayer.json";
import usdtAbiJson from "../../shared/abis/USDT.json";
import { formatUnits, parseUnits, type Abi } from "viem";

type DeploymentScope = {
  factory?: string;
  marketFactory?: string;
  oracleRelayer?: string;
  token?: string;
  usdt?: string;
};

type Deployments = DeploymentScope & {
  xlayerMainnet?: DeploymentScope;
  xLayerMainnet?: DeploymentScope;
  xlayer?: DeploymentScope;
  mainnet?: DeploymentScope;
  "196"?: DeploymentScope;
};

export const USDT_ADDRESS = "0x74b7F16337b8972027F6196A17a631aC6dE26d22";
export const USDT_DECIMALS = 6;
export const MIN_STAKE_DISPLAY = "0.01";
export const MAX_STAKE_DISPLAY = "5.00";

const deploymentData = deployments as Deployments;
const activeDeployments =
  deploymentData.xlayerMainnet ??
  deploymentData.xLayerMainnet ??
  deploymentData.xlayer ??
  deploymentData.mainnet ??
  deploymentData["196"] ??
  deploymentData;

export const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS ??
  activeDeployments.factory ??
  activeDeployments.marketFactory ??
  "placeholder_until_deployed";

export const factoryAddress = FACTORY_ADDRESS;
export const factoryAbi = factoryAbiJson as Abi;
export const predictionMarketAbi = predictionMarketAbiJson as Abi;
export const oracleRelayerAbi = oracleRelayerAbiJson as Abi;
export const usdtAbi = usdtAbiJson as Abi;

export const predictionMarketReadAbi = [
  ...predictionMarketAbi,
  {
    type: "function",
    name: "feePercent",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as Abi;

export const stakedEventAbi = {
  type: "event",
  name: "Staked",
  inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "side", type: "bool", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
  ],
  anonymous: false,
} as const;

export const claimedEventAbi = {
  type: "event",
  name: "Claimed",
  inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
  anonymous: false,
} as const;

export function parseUSDT(amount: string): bigint {
  return parseUnits(amount, USDT_DECIMALS);
}

export function formatUSDT(amount: bigint): string {
  return formatUnits(amount, USDT_DECIMALS);
}
