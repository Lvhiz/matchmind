import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";

const XLAYER_USDT = "0x74b7F16337b8972027F6196A17a631aC6dE26d22";
const SHARED_DIR = path.resolve(__dirname, "../../shared");
const DEPLOYMENTS_PATH = path.join(SHARED_DIR, "deployments.json");
const ABIS_DIR = path.join(SHARED_DIR, "abis");

const CONTRACTS_TO_EXPORT = [
  "OracleRelayer",
  "MarketFactory",
  "PredictionMarket",
] as const;

type DeploymentCost = {
  contract: string;
  address: string;
  gasUsed: bigint;
  okbSpent: bigint;
};

function loadEnv(): void {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

async function deploymentCost(
  label: string,
  address: string,
  txHash: string | undefined
): Promise<DeploymentCost> {
  if (!txHash) {
    return { contract: label, address, gasUsed: 0n, okbSpent: 0n };
  }
  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    return { contract: label, address, gasUsed: 0n, okbSpent: 0n };
  }
  const gasUsed = receipt.gasUsed;
  const tx = await ethers.provider.getTransaction(txHash);
  const gasPrice = receipt.gasPrice ?? tx?.gasPrice ?? 0n;
  const okbSpent = gasUsed * gasPrice;
  return { contract: label, address, gasUsed, okbSpent };
}

function copyAbis(): void {
  const artifactsRoot = path.resolve(__dirname, "../artifacts/contracts");

  fs.mkdirSync(ABIS_DIR, { recursive: true });

  for (const name of CONTRACTS_TO_EXPORT) {
    const artifactPath = path.join(artifactsRoot, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}. Run compile first.`);
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(
      path.join(ABIS_DIR, `${name}.json`),
      JSON.stringify(artifact.abi, null, 2)
    );
    console.log(`ABI copied: shared/abis/${name}.json`);
  }
}

async function main() {
  loadEnv();

  const [deployer] = await ethers.getSigners();
  const agentAddress = process.env.AGENT_ADDRESS;
  if (!agentAddress) {
    throw new Error("AGENT_ADDRESS is required in .env");
  }

  const balanceBefore = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer:", deployer.address);
  console.log("Agent:", agentAddress);
  console.log("USDT:", XLAYER_USDT);
  console.log("Network: X Layer mainnet (chainId 196)\n");

  const OracleRelayer = await ethers.getContractFactory("OracleRelayer");
  const relayer = await OracleRelayer.deploy(agentAddress);
  await relayer.waitForDeployment();
  const relayerAddr = await relayer.getAddress();
  const relayerTx = relayer.deploymentTransaction()?.hash;

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    relayerAddr,
    XLAYER_USDT,
    deployer.address,
    agentAddress
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  const factoryTx = factory.deploymentTransaction()?.hash;

  // Align agent on both contracts (idempotent if constructor already set it)
  const currentRelayerAgent = await relayer.agent();
  if (currentRelayerAgent.toLowerCase() !== agentAddress.toLowerCase()) {
    await (await relayer.setAgent(agentAddress)).wait();
    console.log("Agent updated on OracleRelayer");
  }

  const currentFactoryAgent = await factory.agent();
  if (currentFactoryAgent.toLowerCase() !== agentAddress.toLowerCase()) {
    await (await factory.setAgent(agentAddress)).wait();
    console.log("Agent updated on MarketFactory");
  }

  const costs: DeploymentCost[] = [];
  costs.push(await deploymentCost("OracleRelayer", relayerAddr, relayerTx));
  costs.push(await deploymentCost("MarketFactory", factoryAddr, factoryTx));

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  const totalOkbSpent = balanceBefore - balanceAfter;

  const deployment = {
    network: "xlayer_mainnet",
    chainId: 196,
    oracleRelayer: relayerAddr,
    marketFactory: factoryAddr,
    usdtToken: XLAYER_USDT,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    agent: agentAddress,
    feeRecipient: deployer.address,
  };

  fs.mkdirSync(SHARED_DIR, { recursive: true });
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved: shared/deployments.json`);

  copyAbis();

  console.log("\n--- Deployment summary ---");
  for (const c of costs) {
    console.log(
      `${c.contract}: ${c.address} | gas: ${c.gasUsed.toString()} | OKB: ${ethers.formatEther(c.okbSpent)}`
    );
  }
  console.log(`\nTotal OKB spent (balance delta): ${ethers.formatEther(totalOkbSpent)}`);
  console.log("\nOracleRelayer:", relayerAddr);
  console.log("MarketFactory:", factoryAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
