"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { FACTORY_ADDRESS, predictionMarketAbi } from "../../../lib/contracts";
import { usePortfolio, type Position } from "./usePortfolio";

type Filter = "all" | "open" | "won" | "lost" | "claimed";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "claimed", label: "Claimed" },
];

export default function PortfolioPage() {
  const { isConnected } = useAccount();
  const { positions, stats, isLoading, refetch } = usePortfolio();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const filteredPositions = useMemo(() => {
    if (activeFilter === "all") {
      return positions;
    }

    return positions.filter((position) => position.status === activeFilter);
  }, [activeFilter, positions]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-[#222222] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">My Portfolio</h1>
            <p className="mt-1 text-sm text-neutral-400">
              All data sourced from X Layer mainnet events
            </p>
          </div>

          <button
            onClick={() => void refetch()}
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#222222] bg-[#111111] px-4 text-lg text-white transition hover:border-[#00D395]/60 hover:text-[#00D395]"
            aria-label="Refresh portfolio"
          >
            ↻
          </button>
        </header>

        {!isConnected ? (
          <section className="flex min-h-[520px] flex-col items-center justify-center text-center">
            <h2 className="max-w-md text-2xl font-bold text-white">
              Connect your wallet to view your prediction history
            </h2>
            <div className="mt-8">
              <ConnectButton />
            </div>
          </section>
        ) : (
          <>
            <StatsRow stats={stats} />

            <section className="mt-8">
              <FilterTabs activeFilter={activeFilter} onChange={setActiveFilter} />

              <div className="mt-6">
                {isLoading ? (
                  <LoadingState />
                ) : filteredPositions.length === 0 ? (
                  <EmptyState />
                ) : (
                  <PositionsView positions={filteredPositions} onClaimed={refetch} />
                )}
              </div>
            </section>

            <FooterNote />
          </>
        )}
      </div>
    </main>
  );
}

function StatsRow({ stats }: { stats: ReturnType<typeof usePortfolio>["stats"] }) {
  const winRateClass =
    stats.winRate > 50
      ? "text-[#00D395]"
      : stats.winRate < 50 && stats.winRate > 0
        ? "text-red-400"
        : "text-neutral-300";
  const netPnlNumber = Number(stats.netPnLUSDT);
  const netPnlClass =
    netPnlNumber > 0
      ? "text-[#00D395]"
      : netPnlNumber < 0
        ? "text-red-400"
        : "text-neutral-300";

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total Staked"
        value={`$${stats.totalStakedUSDT} USDT`}
        valueClassName="text-[#00D395]"
      />
      <StatCard
        label="Total Won"
        value={`$${stats.totalWonUSDT} USDT`}
        valueClassName="text-[#00D395]"
      />
      <StatCard label="Win Rate" value={`${stats.winRate}%`} valueClassName={winRateClass} />
      <StatCard
        label="Net P&L"
        value={`$${stats.netPnLUSDT} USDT`}
        valueClassName={netPnlClass}
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <div className="rounded-md border border-[#222222] bg-[#111111] p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</div>
    </div>
  );
}

function FilterTabs({
  activeFilter,
  onChange,
}: {
  activeFilter: Filter;
  onChange: (filter: Filter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-5 border-b border-[#222222] text-sm font-semibold text-neutral-400">
      {filters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onChange(filter.key)}
          className={`border-b-2 pb-3 transition ${
            activeFilter === filter.key
              ? "border-[#00D395] text-[#00D395]"
              : "border-transparent hover:text-white"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function PositionsView({
  positions,
  onClaimed,
}: {
  positions: Position[];
  onClaimed: () => Promise<void>;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-md border border-[#222222] md:block">
        <table className="w-full border-collapse bg-[#111111] text-left text-sm">
          <thead className="border-b border-[#222222] text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Question</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 font-semibold">Stake</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Payout</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <PositionRow
                key={`${position.marketAddress}-${position.txHash}`}
                position={position}
                onClaimed={onClaimed}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:hidden">
        {positions.map((position) => (
          <PositionCard
            key={`${position.marketAddress}-${position.txHash}`}
            position={position}
            onClaimed={onClaimed}
          />
        ))}
      </div>
    </>
  );
}

function PositionRow({
  position,
  onClaimed,
}: {
  position: Position;
  onClaimed: () => Promise<void>;
}) {
  return (
    <tr className="border-b border-[#222222] last:border-b-0">
      <td className="px-4 py-4 text-white">{truncateQuestion(position.question)}</td>
      <td className="px-4 py-4">
        <SideBadge side={position.side} />
      </td>
      <td className="px-4 py-4 text-neutral-300">${position.amountUSDT} USDT</td>
      <td className="px-4 py-4">
        <StatusBadge status={position.status} />
      </td>
      <td className="px-4 py-4 text-neutral-300">{formatPayout(position)}</td>
      <td className="px-4 py-4">
        <ClaimAction position={position} onClaimed={onClaimed} />
      </td>
    </tr>
  );
}

function PositionCard({
  position,
  onClaimed,
}: {
  position: Position;
  onClaimed: () => Promise<void>;
}) {
  return (
    <article className="rounded-md border border-[#222222] bg-[#111111] p-4">
      <div className="text-base font-semibold text-white">{truncateQuestion(position.question)}</div>
      <div className="mt-4 grid gap-3 text-sm">
        <MobileField label="Side" value={<SideBadge side={position.side} />} />
        <MobileField label="Stake" value={<span>${position.amountUSDT} USDT</span>} />
        <MobileField label="Status" value={<StatusBadge status={position.status} />} />
        <MobileField label="Payout" value={<span>{formatPayout(position)}</span>} />
        <MobileField
          label="Action"
          value={<ClaimAction position={position} onClaimed={onClaimed} />}
        />
      </div>
    </article>
  );
}

function MobileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-neutral-400">
      <span>{label}</span>
      <div className="text-right text-neutral-200">{value}</div>
    </div>
  );
}

function ClaimAction({
  position,
  onClaimed,
}: {
  position: Position;
  onClaimed: () => Promise<void>;
}) {
  const { writeContractAsync } = useWriteContract();
  const [isClaiming, setIsClaiming] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (position.status !== "won") {
    return <span className="text-neutral-500">-</span>;
  }

  const claim = async () => {
    setIsClaiming(true);
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: position.marketAddress as `0x${string}`,
        abi: predictionMarketAbi,
        functionName: "claim",
      });
      setTxHash(hash);
      void onClaimed();
    } catch (claimError) {
      setError(claimError instanceof Error ? cleanError(claimError.message) : "Claim failed");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={claim}
        disabled={isClaiming}
        className="inline-flex h-9 min-w-[84px] items-center justify-center rounded-md bg-[#00D395] px-3 text-sm font-semibold text-black transition hover:bg-[#22e0a6] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isClaiming ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        ) : (
          "Claim"
        )}
      </button>

      {txHash ? (
        <a
          href={`https://www.oklink.com/xlayer/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#00D395] hover:underline"
        >
          View tx →
        </a>
      ) : null}

      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function SideBadge({ side }: { side: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        side ? "bg-green-600/20 text-green-300" : "bg-red-600/20 text-red-300"
      }`}
    >
      {side ? "YES" : "NO"}
    </span>
  );
}

function StatusBadge({ status }: { status: Position["status"] }) {
  const styles = {
    open: "bg-blue-500/20 text-blue-300",
    won: "bg-green-600/20 text-green-300",
    lost: "bg-red-600/20 text-red-300",
    claimed: "bg-neutral-700 text-neutral-300",
  };
  const labels = {
    open: "Open",
    won: "Won ✓",
    lost: "Lost ✗",
    claimed: "Claimed",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="rounded-md border border-[#222222] bg-[#111111] p-4">
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid animate-pulse gap-3 md:grid-cols-[2fr_0.5fr_0.7fr_0.7fr_0.7fr_0.7fr]"
          >
            <div className="h-6 rounded bg-neutral-800" />
            <div className="h-6 rounded bg-neutral-800" />
            <div className="h-6 rounded bg-neutral-800" />
            <div className="h-6 rounded bg-neutral-800" />
            <div className="h-6 rounded bg-neutral-800" />
            <div className="h-6 rounded bg-neutral-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-[#222222] bg-[#111111] px-6 text-center">
      <h2 className="text-2xl font-bold text-white">No positions yet.</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-400">
        Start with as little as $0.01 USDT on any live market.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-[#00D395] px-5 text-sm font-bold text-black transition hover:bg-[#22e0a6]"
      >
        View Live Markets →
      </Link>
    </div>
  );
}

function FooterNote() {
  return (
    <section className="mt-10 rounded-md border border-[#222222] bg-[#111111] p-5">
      <h2 className="text-lg font-bold text-white">Fully Transparent</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">
        All portfolio data is derived entirely from X Layer mainnet contract events. No database or
        backend server is used - every position, payout and transaction is permanently recorded
        onchain and publicly verifiable.
      </p>
      <a
        href={`https://www.oklink.com/xlayer/address/${FACTORY_ADDRESS}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex text-sm font-semibold text-[#00D395] hover:underline"
      >
        View contract on OKLink →
      </a>
    </section>
  );
}

function formatPayout(position: Position): string {
  if (position.status === "lost" || position.status === "open") {
    return "-";
  }

  return position.payoutUSDT ? `$${position.payoutUSDT} USDT` : "-";
}

function truncateQuestion(question: string): string {
  return question.length > 40 ? `${question.slice(0, 40)}...` : question;
}

function cleanError(message: string): string {
  if (message.includes("AlreadyClaimed")) return "Already claimed";
  if (message.includes("NotWinner")) return "Not claimable";
  if (message.includes("MarketNotResolved")) return "Market not resolved";
  return message.split("\n")[0] || "Claim failed";
}
