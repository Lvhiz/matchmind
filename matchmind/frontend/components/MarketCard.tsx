'use client'

import { useEffect, useMemo, useState } from "react";
import type { MarketData } from "../hooks/useActiveMarkets";
import { StakeModal } from "./StakeModal";

type Props = {
  market: MarketData;
};

export function MarketCard({ market }: Props) {
  const [selectedSide, setSelectedSide] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, market.expiry ? Number(market.expiry) - Math.floor(now / 1000) : 0);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const urgent = secondsLeft < 60;
  const critical = secondsLeft < 30;
  const closing = secondsLeft < 10;
  const timerText = closing ? "CLOSING" : `${mm}:${ss}`;

  const statusOverlay = market.resolved
    ? market.winningSide
      ? "✓ YES WON"
      : "✓ NO WON"
    : market.isExpired
      ? "Resolving..."
      : null;

  const cardClass = useMemo(() => {
    const base = "relative overflow-hidden rounded-md border border-white/10 bg-[#121212] p-5 shadow-lg transition-transform duration-300 animate-[slideIn_0.4s_ease-out]";
    const flash = "before:absolute before:inset-0 before:rounded-md before:border before:border-green-400/80 before:opacity-0 before:content-[''] before:animate-[borderFlash_1.5s_ease-out]";
    return `${base} ${flash}`;
  }, []);

  return (
    <>
      <div className={cardClass}>
        <style>{`
          @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes borderFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
          @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
        `}</style>

        {statusOverlay ? (
          <div className={`absolute inset-0 z-10 flex items-center justify-center gap-3 bg-black/75 text-2xl font-bold ${market.resolved && market.winningSide ? "text-green-400" : market.resolved ? "text-red-400" : "text-white"}`}>
            {!market.resolved ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            <span>{statusOverlay}</span>
          </div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="text-xl font-bold text-white">{market.question}</div>
          <div className={`shrink-0 text-right text-lg font-semibold ${closing ? "animate-[shake_0.6s_infinite] text-red-400" : critical ? "animate-pulse text-red-400" : urgent ? "text-orange-400" : "text-white"}`}>
            {timerText}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">
            YES {market.yesPercent.toFixed(0)}%
          </span>
          <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">
            NO {market.noPercent.toFixed(0)}%
          </span>
        </div>

        <div className="mb-4 text-sm text-neutral-400">Pool: ${market.totalPoolUSDT} USDT</div>

        <div className="grid gap-3">
          <button
            onClick={() => setSelectedSide(true)}
            className="h-14 w-full rounded-md bg-green-600 text-white transition hover:bg-green-500"
          >
            YES · {market.yesPercent.toFixed(0)}%
          </button>
          <button
            onClick={() => setSelectedSide(false)}
            className="h-14 w-full rounded-md bg-red-600 text-white transition hover:bg-red-500"
          >
            NO · {market.noPercent.toFixed(0)}%
          </button>
        </div>
      </div>

      {selectedSide !== null ? (
        <StakeModal market={market} side={selectedSide} onClose={() => setSelectedSide(null)} />
      ) : null}
    </>
  );
}
