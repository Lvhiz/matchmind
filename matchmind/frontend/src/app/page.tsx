'use client'

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { MarketCard } from "../components/MarketCard";
import { useToast } from "../components/Toast";
import { useActiveMarkets } from "../hooks/useActiveMarkets";

type AgentFeedEntry = {
  question: string;
  reasoning: string;
  elapsed?: number;
  homeTeam?: string;
  awayTeam?: string;
  timestamp?: string;
};

type AgentStatePayload = {
  status?: string;
  updatedAt?: string;
  marketReasoning?: unknown[];
  reasoningEntries?: unknown[];
  entries?: unknown[];
  markets?: unknown[];
  openMarkets?: unknown[];
  suggestions?: unknown[];
};

const AGENT_REFRESH_MS = 30_000;

const stats = [
  { value: "$0.01", label: "Minimum Stake" },
  { value: "3-7 min", label: "Market Duration" },
  { value: "100%", label: "Onchain Logic" },
];

const navLinks = [
  { label: "Markets", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Agent", href: "/agent" },
];

export default function Home() {
  const { isConnected } = useAccount();
  const { markets, isLoading } = useActiveMarkets();
  const { showToast } = useToast();
  const [agentEntries, setAgentEntries] = useState<AgentFeedEntry[]>([]);
  const feedToastShown = useRef(false);

  const newestMarkets = useMemo(() => [...markets].reverse(), [markets]);
  const hasLiveMarkets = markets.length > 0;

  const loadAgentFeed = useCallback(async () => {
    try {
      const response = await fetch("/api/agent-state", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Agent state request failed");
      }

      const payload = (await response.json()) as AgentStatePayload;
      setAgentEntries(normalizeAgentEntries(payload));
      feedToastShown.current = false;
    } catch {
      setAgentEntries([]);

      if (!feedToastShown.current) {
        showToast("Agent feed unavailable", "error");
        feedToastShown.current = true;
      }
    }
  }, [showToast]);

  useEffect(() => {
    void loadAgentFeed();
    const interval = window.setInterval(() => {
      void loadAgentFeed();
    }, AGENT_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadAgentFeed]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Header hasLiveMarkets={hasLiveMarkets} />

      {!isConnected ? <Hero /> : null}

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">⚡ Live Markets</h2>
          <span className="rounded-full border border-[#00D395]/30 bg-[#00D395]/10 px-3 py-1 text-sm font-semibold text-[#00D395]">
            {markets.length} Active
          </span>
        </div>

        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <MarketSkeleton />
            <MarketSkeleton />
            <MarketSkeleton />
          </div>
        ) : null}

        {!isLoading && markets.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-[#222222] bg-[#111111] px-6 text-center">
            <p className="text-xl font-semibold text-white">⚽ No live markets right now.</p>
            <p className="mt-2 text-sm italic text-neutral-400">
              The AI agent is watching for the next match.
            </p>
          </div>
        ) : null}

        {!isLoading && markets.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {newestMarkets.map((market) => (
              <MarketCard key={market.address} market={market} />
            ))}
          </div>
        ) : null}
      </section>

      <AgentFeed entries={agentEntries} />

      <footer className="px-4 py-10 text-center text-sm text-neutral-500">
        Live on X Layer Mainnet · Powered by Claude AI · Min stake $0.01 USDT · All market logic onchain
      </footer>
    </main>
  );
}

function Header({ hasLiveMarkets }: { hasLiveMarkets: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#222222] bg-[#0a0a0a]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="text-lg font-bold text-white">
              ⚽ MatchMind
            </Link>
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  hasLiveMarkets ? "animate-live-pulse bg-[#00D395]" : "bg-neutral-500"
                }`}
              />
              <span>{hasLiveMarkets ? "AI Agent Live" : "Waiting for match"}</span>
            </div>
          </div>
          <div className="mt-1 text-xs font-medium text-[#00D395]">Live on X Layer Mainnet</div>
        </div>

        <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-neutral-300 md:justify-center">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="md:flex md:justify-end">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-5xl font-bold leading-tight text-white">Predict what happens next.</h1>
      <p className="mt-2 text-5xl font-bold leading-tight text-white">Every 5 minutes.</p>
      <p className="mt-6 max-w-[600px] text-lg leading-8 text-neutral-400">
        AI-generated micro-markets on live World Championship football. Real stakes from $0.01
        USDT. All logic onchain.
      </p>

      <div className="mt-8 flex justify-center">
        <HeroConnectButton />
      </div>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-[#222222] bg-[#111111] p-5">
            <div className="text-2xl font-bold text-[#00D395]">{stat.value}</div>
            <div className="mt-1 text-sm text-neutral-400">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        if (!mounted) {
          return (
            <button
              className="h-14 min-w-[220px] rounded-md bg-[#00D395]/60 px-8 text-base font-bold text-black"
              disabled
            >
              Connect Wallet
            </button>
          );
        }

        if (!account) {
          return (
            <button
              onClick={openConnectModal}
              className="h-14 min-w-[220px] rounded-md bg-[#00D395] px-8 text-base font-bold text-black transition hover:bg-[#22e0a6]"
            >
              Connect Wallet
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="h-14 min-w-[220px] rounded-md bg-red-500 px-8 text-base font-bold text-white transition hover:bg-red-400"
            >
              Switch Network
            </button>
          );
        }

        return (
          <button
            onClick={openAccountModal}
            className="h-14 min-w-[220px] rounded-md bg-[#00D395] px-8 text-base font-bold text-black transition hover:bg-[#22e0a6]"
          >
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

function MarketSkeleton() {
  return (
    <div className="min-h-[280px] animate-pulse rounded-md border border-[#222222] bg-[#111111] p-5">
      <div className="h-6 w-4/5 rounded bg-neutral-800" />
      <div className="mt-3 h-6 w-2/3 rounded bg-neutral-800" />
      <div className="mt-6 flex gap-2">
        <div className="h-8 w-24 rounded-full bg-neutral-800" />
        <div className="h-8 w-24 rounded-full bg-neutral-800" />
      </div>
      <div className="mt-8 h-14 rounded-md bg-neutral-800" />
      <div className="mt-3 h-14 rounded-md bg-neutral-800" />
    </div>
  );
}

function AgentFeed({ entries }: { entries: AgentFeedEntry[] }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-white">Why the AI opened these markets</h2>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-md border border-[#222222] bg-[#111111] p-6 text-sm text-neutral-400">
          Agent reasoning will appear here during live matches
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {entries.slice(0, 5).map((entry, index) => (
            <article key={`${entry.question}-${index}`} className="rounded-md border border-[#222222] bg-[#111111] p-5">
              <h3 className="font-semibold text-white">{entry.question}</h3>
              <p className="mt-2 text-sm italic text-neutral-400">{entry.reasoning}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                <span>
                  min {entry.elapsed ?? "?"} | {entry.homeTeam ?? "Home"}-{entry.awayTeam ?? "Away"}
                </span>
                <span>{formatTimeAgo(entry.timestamp)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-5 text-center text-xs text-neutral-500">
        AI reasoning stored permanently on IPFS · Linked to onchain events
      </div>
    </section>
  );
}

function normalizeAgentEntries(payload: AgentStatePayload | null): AgentFeedEntry[] {
  if (!payload || payload.status === "offline") {
    return [];
  }

  const source =
    payload.marketReasoning ??
    payload.reasoningEntries ??
    payload.entries ??
    payload.markets ??
    payload.openMarkets ??
    payload.suggestions ??
    [];

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => normalizeAgentEntry(item, payload.updatedAt))
    .filter((entry): entry is AgentFeedEntry => Boolean(entry))
    .sort((a, b) => timestampMs(b.timestamp) - timestampMs(a.timestamp))
    .slice(0, 5);
}

function normalizeAgentEntry(item: unknown, fallbackTimestamp?: string): AgentFeedEntry | null {
  if (!isRecord(item)) {
    return null;
  }

  const context = isRecord(item.matchContext)
    ? item.matchContext
    : isRecord(item.match)
      ? item.match
      : {};
  const question = getString(item.question) ?? getString(item.title);
  const reasoning = getString(item.reasoning) ?? getString(item.explanation) ?? getString(item.why);

  if (!question || !reasoning) {
    return null;
  }

  return {
    question,
    reasoning,
    elapsed: getNumber(context.elapsed) ?? getNumber(item.elapsed),
    homeTeam: getString(context.homeTeam) ?? getString(item.homeTeam),
    awayTeam: getString(context.awayTeam) ?? getString(item.awayTeam),
    timestamp:
      getString(item.timestamp) ??
      getString(item.createdAt) ??
      getString(item.openedAt) ??
      getString(item.updatedAt) ??
      fallbackTimestamp,
  };
}

function formatTimeAgo(timestamp?: string): string {
  if (!timestamp) {
    return "just now";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestampMs(timestamp)) / 1000));
  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

function timestampMs(timestamp?: string): number {
  if (!timestamp) {
    return Date.now();
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
