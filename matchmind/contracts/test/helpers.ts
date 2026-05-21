import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  MarketFactory,
  MockUSDT,
  OracleRelayer,
  PredictionMarket,
} from "../typechain-types";

export const MIN_STAKE = 10_000n;
export const MAX_STAKE = 5_000_000n;
export const USDT_DECIMALS = 6n;

export type CoreFixture = {
  owner: HardhatEthersSigner;
  agent: HardhatEthersSigner;
  feeRecipient: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  stranger: HardhatEthersSigner;
  usdt: MockUSDT;
  relayer: OracleRelayer;
  factory: MarketFactory;
};

export async function deployCore(): Promise<CoreFixture> {
  const [owner, agent, feeRecipient, alice, bob, stranger] =
    await ethers.getSigners();

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();

  const OracleRelayer = await ethers.getContractFactory("OracleRelayer");
  const relayer = await OracleRelayer.deploy(agent.address);

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    await relayer.getAddress(),
    await usdt.getAddress(),
    feeRecipient.address,
    agent.address
  );

  return { owner, agent, feeRecipient, alice, bob, stranger, usdt, relayer, factory };
}

export async function createMarket(
  factory: MarketFactory,
  agent: HardhatEthersSigner,
  question = "Will Team A win?",
  feePct = 2n,
  expiryOffsetSec = 7 * 24 * 60 * 60
): Promise<{ market: PredictionMarket; marketAddr: string; expiry: number }> {
  const latest = await time.latest();
  const expiry = latest + expiryOffsetSec;

  await factory.connect(agent).createMarket(question, expiry, feePct);
  const count = await factory.marketCount();
  const all = await factory.getAllMarkets();
  const marketAddr = all[Number(count) - 1];
  const market = await ethers.getContractAt("PredictionMarket", marketAddr);

  return { market, marketAddr, expiry };
}

export async function fundAndApprove(
  usdt: MockUSDT,
  user: HardhatEthersSigner,
  marketAddr: string,
  amount = 20_000_000n
) {
  await usdt.mint(user.address, amount);
  await usdt.connect(user).approve(marketAddr, amount);
}

export async function signResolution(
  agent: HardhatEthersSigner,
  market: string,
  outcome: boolean,
  relayer: OracleRelayer
): Promise<string> {
  const { chainId } = await ethers.provider.getNetwork();
  const payload = ethers.solidityPacked(
    ["address", "bool", "uint256", "address"],
    [market, outcome, chainId, await relayer.getAddress()]
  );
  const hash = ethers.keccak256(payload);
  return agent.signMessage(ethers.getBytes(hash));
}

export async function resolveViaRelayer(
  relayer: OracleRelayer,
  agent: HardhatEthersSigner,
  marketAddr: string,
  outcome: boolean
) {
  const signature = await signResolution(agent, marketAddr, outcome, relayer);
  await relayer.resolveMarket(marketAddr, outcome, signature);
}

/** Expected claim payout for a winning staker. */
export function expectedPayout(
  stakeAmount: bigint,
  winningPool: bigint,
  losingPool: bigint,
  feePercent: bigint
): { winnings: bigint; fee: bigint; payout: bigint } {
  const winnings =
    winningPool > 0n && losingPool > 0n
      ? (stakeAmount * losingPool) / winningPool
      : 0n;
  const fee = (winnings * feePercent) / 100n;
  const payout = stakeAmount + winnings - fee;
  return { winnings, fee, payout };
}
