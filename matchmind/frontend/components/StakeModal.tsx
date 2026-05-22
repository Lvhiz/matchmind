'use client'

import { useEffect, useMemo, useState } from "react";
import { useWriteContract } from "wagmi";
import { parseUSDT, predictionMarketAbi } from "../lib/contracts";
import type { MarketData } from "../hooks/useActiveMarkets";
import { useUSDTApproval } from "../hooks/useUSDTApproval";
import { useToast } from "./Toast";

type Props = {
  market: MarketData;
  side: boolean;
  onClose: () => void;
};

const ZERO = BigInt(0);

export function StakeModal({ market, side, onClose }: Props) {
  const [amount, setAmount] = useState("0.01");
  const { writeContractAsync } = useWriteContract();
  const { approveUSDT, isApproved, isApproving } = useUSDTApproval(market.address);
  const [isStaking, setIsStaking] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { showToast } = useToast();

  const stakeAmount = useMemo(() => parseUSDT(amount || "0"), [amount]);
  const approved = isApproved(market.address, stakeAmount);
  const sidePool = side ? market.yesPool : market.noPool;
  const totalPool = market.yesPool + market.noPool;
  const payout = useMemo(() => {
    if (sidePool === ZERO || stakeAmount === ZERO) {
      return amount;
    }

    const est = (Number(amount) * Number(totalPool)) / Number(sidePool);
    return Number.isFinite(est) ? est.toFixed(2) : amount;
  }, [amount, sidePool, stakeAmount, totalPool]);

  useEffect(() => {
    if (!txHash) return;
    const timer = window.setTimeout(() => onClose(), 2000);
    return () => window.clearTimeout(timer);
  }, [txHash, onClose]);

  const submit = async () => {
    setErrorMessage(null);

    try {
      if (!approved) {
        await approveUSDT(market.address, stakeAmount);
        showToast("USDT approved ✓", "success");
        return;
      }

      setIsStaking(true);
      const hash = await writeContractAsync({
        address: market.address as `0x${string}`,
        abi: predictionMarketAbi,
        functionName: "stake",
        args: [side, stakeAmount],
      });
      setTxHash(hash);
      showToast(`Staked $${amount} on ${side ? "YES" : "NO"} ✓`, "success");
    } catch (error) {
      const message = mapRevertReason(error);
      setErrorMessage(message);
      showToast(message, "error");
    } finally {
      setIsStaking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-md border border-white/10 bg-[#111] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-2 text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          ×
        </button>

        <div className="mb-4">
          <div className="text-lg font-semibold">{market.question}</div>
          <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${side ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
            {side ? "YES" : "NO"}
          </div>
        </div>

        <label className="block text-sm text-neutral-300">
          Stake Amount (USDT)
          <input
            type="number"
            min="0.01"
            max="5.00"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2 w-full rounded-md border border-white/10 bg-black px-3 py-2 text-white outline-none focus:border-white/20"
          />
        </label>
        <div className="mt-1 text-xs text-neutral-500">Min $0.01 · Max $5.00 USDT</div>

        <div className="mt-4 text-sm text-neutral-300">Est. payout: ${payout} USDT</div>

        {errorMessage ? <div className="mt-4 text-sm text-red-400">{errorMessage}</div> : null}

        {txHash ? (
          <a
            className="mt-4 block text-sm text-green-400 hover:underline"
            href={`https://www.oklink.com/xlayer/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on OKLink →
          </a>
        ) : null}

        <button
          onClick={submit}
          disabled={isApproving || isStaking}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isApproving || isStaking ? <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" /> : null}
          {isApproving
            ? "Approving..."
            : isStaking
              ? "Staking..."
              : approved
                ? "Step 2 of 2 — Confirm Stake"
                : "Step 1 of 2 — Approve USDT"}
        </button>
      </div>
    </div>
  );
}

function mapRevertReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("MarketExpired")) return "This market has closed";
  if (message.includes("AlreadyClaimed")) return "You already claimed this";
  if (message.includes("InvalidStakeAmount")) return "Minimum stake is $0.01 USDT";
  if (message.includes("MarketAlreadyResolved")) return "This market has already resolved";
  if (message.includes("Market expired")) return "This market has closed";
  if (message.includes("Already claimed")) return "You already claimed this";
  if (message.includes("Below minimum")) return "Minimum stake is $0.01 USDT";
  return message;
}
