'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Address,
  type Log,
} from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import {
  FACTORY_ADDRESS,
  claimedEventAbi,
  factoryAbi,
  formatUSDT,
  parseUSDT,
  predictionMarketReadAbi,
  stakedEventAbi,
} from "../../../lib/contracts";

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

export type Position = {
  marketAddress: string;
  question: string;
  side: boolean;
  amountUSDT: string;
  status: "open" | "won" | "lost" | "claimed";
  payoutUSDT?: string;
  txHash: string;
};

export type PortfolioStats = {
  totalStakedUSDT: string;
  totalWonUSDT: string;
  winRate: number;
  netPnLUSDT: string;
};

type MarketMeta = {
  question: string;
  expiryTimestamp: bigint;
  resolved: boolean;
  winningSide: boolean;
  yesPool: bigint;
  noPool: bigint;
  feePercent: bigint;
};

type LoadedPosition = Position & {
  blockNumber: bigint;
  logIndex: number;
};

const REFRESH_INTERVAL_MS = 15_000;
const ZERO = BigInt(0);
const ONE_HUNDRED = BigInt(100);
const ZERO_STATS: PortfolioStats = {
  totalStakedUSDT: "0.00",
  totalWonUSDT: "0.00",
  winRate: 0,
  netPnLUSDT: "0.00",
};
export function usePortfolio() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const factoryAddress = useMemo(
    () => (isAddressLike(FACTORY_ADDRESS) ? (FACTORY_ADDRESS as Address) : undefined),
    []
  );

  const {
    data: marketAddresses,
    isLoading: isLoadingMarkets,
    refetch: refetchMarkets,
  } = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "getAllMarkets",
    query: {
      enabled: Boolean(address && publicClient && factoryAddress),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const allMarkets = useMemo(
    () => (Array.isArray(marketAddresses) ? (marketAddresses as Address[]) : []),
    [marketAddresses]
  );

  const refetch = useCallback(async () => {
    try {
      await refetchMarkets();
    } finally {
      setRefreshTick((value) => value + 1);
    }
  }, [refetchMarkets]);

  useEffect(() => {
    if (!address || !publicClient || allMarkets.length === 0) {
      setPositions([]);
      setIsFetchingLogs(false);
      return;
    }

    let cancelled = false;
    const client = publicClient;
    const walletAddress = address;

    async function loadPortfolio() {
      setIsFetchingLogs(true);

      try {
        const loaded = await Promise.all(
          allMarkets.map((marketAddress) =>
            loadMarketPositions(client, marketAddress, walletAddress)
          )
        );

        if (!cancelled) {
          const flattened = loaded.flat().sort(compareLoadedPositionsNewestFirst);
          setPositions(flattened.map(({ blockNumber: __blockNumber, _logIndex: _logIndex, ...position }) => position));
        }
      } catch {
        if (!cancelled) {
          setPositions([]);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingLogs(false);
        }
      }
    }

    void loadPortfolio();

    const interval = window.setInterval(() => {
      void loadPortfolio();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [address, allMarkets, publicClient, refreshTick]);

  const stats = useMemo(() => calculateStats(positions), [positions]);

  return {
    positions,
    stats,
    isLoading: isLoadingMarkets || isFetchingLogs,
    refetch,
  };
}

async function loadMarketPositions(
  publicClient: PublicClient,
  marketAddress: Address,
  walletAddress: Address
): Promise<LoadedPosition[]> {
  const [meta, stakeLogs, claimLogs] = await Promise.all([
    loadMarketMeta(publicClient, marketAddress),
    publicClient.getLogs({
      address: marketAddress,
      event: stakedEventAbi,
      args: { user: walletAddress },
      fromBlock: ZERO,
      toBlock: "latest",
    }),
    publicClient.getLogs({
      address: marketAddress,
      event: claimedEventAbi,
      args: { user: walletAddress },
      fromBlock: ZERO,
      toBlock: "latest",
    }),
  ]);

  const claimLog = claimLogs[0];
  const claimedAmount = claimLog ? getLogArg<bigint>(claimLog, "amount") ?? ZERO : ZERO;
  const hasClaimed = Boolean(claimLog);

  return stakeLogs.map((stakeLog) => {
    const side = getLogArg<boolean>(stakeLog, "side") ?? false;
    const amount = getLogArg<bigint>(stakeLog, "amount") ?? ZERO;
    const status = resolvePositionStatus(meta, side, hasClaimed);
    const payout = resolvePayout(amount, status, meta, claimedAmount);

    return {
      marketAddress,
      question: meta.question,
      side,
      amountUSDT: formatDisplayUSDT(amount),
      status,
      payoutUSDT: payout !== undefined ? formatDisplayUSDT(payout) : undefined,
      txHash: stakeLog.transactionHash,
      blockNumber: stakeLog.blockNumber ?? ZERO,
      logIndex: stakeLog.logIndex ?? 0,
    };
  });
}

async function loadMarketMeta(
  publicClient: PublicClient,
  marketAddress: Address
): Promise<MarketMeta> {
  const [
    question,
    expiryTimestamp,
    yesPool,
    noPool,
    resolved,
    winningSide,
    feePercent,
  ] = await publicClient.multicall({
    contracts: [
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "question",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "expiryTimestamp",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "yesPool",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "noPool",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "resolved",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "winningSide",
      },
      {
        address: marketAddress,
        abi: predictionMarketReadAbi,
        functionName: "feePercent",
      },
    ],
    allowFailure: true,
  });

  return {
    question: typeof question.result === "string" ? question.result : "Prediction market",
    expiryTimestamp:
      typeof expiryTimestamp.result === "bigint" ? expiryTimestamp.result : ZERO,
    yesPool: typeof yesPool.result === "bigint" ? yesPool.result : ZERO,
    noPool: typeof noPool.result === "bigint" ? noPool.result : ZERO,
    resolved: typeof resolved.result === "boolean" ? resolved.result : false,
    winningSide: typeof winningSide.result === "boolean" ? winningSide.result : false,
    feePercent: typeof feePercent.result === "bigint" ? feePercent.result : ZERO,
  };
}

function resolvePositionStatus(
  meta: MarketMeta,
  side: boolean,
  hasClaimed: boolean
): Position["status"] {
  if (!meta.resolved) {
    return "open";
  }

  if (side !== meta.winningSide) {
    return "lost";
  }

  return hasClaimed ? "claimed" : "won";
}

function resolvePayout(
  amount: bigint,
  status: Position["status"],
  meta: MarketMeta,
  claimedAmount: bigint
): bigint | undefined {
  if (status === "lost" || status === "open") {
    return undefined;
  }

  if (status === "claimed") {
    return claimedAmount;
  }

  const winningPool = meta.winningSide ? meta.yesPool : meta.noPool;
  const losingPool = meta.winningSide ? meta.noPool : meta.yesPool;

  if (winningPool === ZERO || losingPool === ZERO) {
    return amount;
  }

  const winnings = (amount * losingPool) / winningPool;
  const fee = (winnings * meta.feePercent) / ONE_HUNDRED;
  return amount + winnings - fee;
}

function calculateStats(positions: Position[]): PortfolioStats {
  if (positions.length === 0) {
    return ZERO_STATS;
  }

  const totalStaked = positions.reduce(
    (sum, position) => sum + parseDisplayUSDT(position.amountUSDT),
    ZERO
  );
  const totalWon = positions.reduce((sum, position) => {
    if (position.status !== "won" && position.status !== "claimed") {
      return sum;
    }

    return sum + parseDisplayUSDT(position.payoutUSDT ?? "0");
  }, ZERO);
  const resolvedPositions = positions.filter((position) => position.status !== "open");
  const winningPositions = positions.filter(
    (position) => position.status === "won" || position.status === "claimed"
  );
  const winRate =
    resolvedPositions.length > 0
      ? Math.round((winningPositions.length / resolvedPositions.length) * 100)
      : 0;
  const netPnl = totalWon - totalStaked;

  return {
    totalStakedUSDT: formatDisplayUSDT(totalStaked),
    totalWonUSDT: formatDisplayUSDT(totalWon),
    winRate,
    netPnLUSDT: formatSignedUSDT(netPnl),
  };
}

function getLogArg<T>(log: Log, key: string): T | undefined {
  const args = "args" in log ? log.args : undefined;

  if (!args || typeof args !== "object" || !(key in args)) {
    return undefined;
  }

  return (args as Record<string, unknown>)[key] as T;
}

function compareLoadedPositionsNewestFirst(
  a: LoadedPosition,
  b: LoadedPosition
): number {
  if (a.blockNumber === b.blockNumber) {
    if (a.logIndex === b.logIndex) {
      return b.txHash.localeCompare(a.txHash);
    }

    return b.logIndex - a.logIndex;
  }

  return a.blockNumber > b.blockNumber ? -1 : 1;
}

function formatDisplayUSDT(amount: bigint): string {
  return formatUSDT(amount);
}

function formatSignedUSDT(amount: bigint): string {
  if (amount < ZERO) {
    return `-${formatDisplayUSDT(-amount)}`;
  }

  return formatDisplayUSDT(amount);
}

function parseDisplayUSDT(amount: string): bigint {
  const negative = amount.startsWith("-");
  const normalized = negative ? amount.slice(1) : amount;
  const value = parseUSDT(normalized);
  return negative ? -value : value;
}

function isAddressLike(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}
