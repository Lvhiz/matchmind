'use client'

import { useMemo } from "react";
import {
  useReadContract,
  useReadContracts,
} from "wagmi";
import {
  FACTORY_ADDRESS,
  factoryAbi,
  formatUSDT,
  predictionMarketAbi,
} from "../lib/contracts";

export type MarketData = {
  address: `0x${string}`;
  question: string;
  expiry: bigint;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  winningSide: boolean;
  timeRemaining: number;
  yesPercent: number;
  noPercent: number;
  totalPoolUSDT: string;
  isExpired: boolean;
};

const REFRESH_INTERVAL_MS = 12000;
const ZERO = BigInt(0);
const PERCENT_SCALE = BigInt(10000);

export function useActiveMarkets() {
  const {
    data: activeMarkets,
    isLoading: isLoadingMarkets,
    refetch,
  } = useReadContract({
    address: FACTORY_ADDRESS as `0x${string}`,
    abi: factoryAbi,
    functionName: "getActiveMarkets",
    query: {
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const activeMarketAddresses = useMemo(
    () => (Array.isArray(activeMarkets) ? (activeMarkets as `0x${string}`[]) : []),
    [activeMarkets]
  );

  const contractReads = useMemo(
    () =>
      activeMarketAddresses.flatMap((address) => [
        { address, abi: predictionMarketAbi, functionName: "question" as const },
        { address, abi: predictionMarketAbi, functionName: "expiryTimestamp" as const },
        { address, abi: predictionMarketAbi, functionName: "yesPool" as const },
        { address, abi: predictionMarketAbi, functionName: "noPool" as const },
        { address, abi: predictionMarketAbi, functionName: "resolved" as const },
        { address, abi: predictionMarketAbi, functionName: "winningSide" as const },
      ]),
    [activeMarketAddresses]
  );

  const { data: marketResults } = useReadContracts({
    contracts: contractReads,
    query: {
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const markets = useMemo<MarketData[]>(() => {
    const now = Math.floor(Date.now() / 1000);

    return activeMarketAddresses.map((address, index) => {
      const base = index * 6;
      const question = (marketResults?.[base]?.result as string | undefined) ?? "";
      const expiry = (marketResults?.[base + 1]?.result as bigint | undefined) ?? ZERO;
      const yesPool = (marketResults?.[base + 2]?.result as bigint | undefined) ?? ZERO;
      const noPool = (marketResults?.[base + 3]?.result as bigint | undefined) ?? ZERO;
      const resolved = (marketResults?.[base + 4]?.result as boolean | undefined) ?? false;
      const winningSide = (marketResults?.[base + 5]?.result as boolean | undefined) ?? false;
      const totalPool = yesPool + noPool;
      const yesPercent = totalPool > ZERO ? Number((yesPool * PERCENT_SCALE) / totalPool) / 100 : 50;
      const noPercent = totalPool > ZERO ? 100 - yesPercent : 50;
      const expirySeconds = Number(expiry);
      const timeRemaining = Math.max(0, expirySeconds - now);

      return {
        address,
        question,
        expiry,
        yesPool,
        noPool,
        resolved,
        winningSide,
        timeRemaining,
        yesPercent,
        noPercent,
        totalPoolUSDT: formatUSDT(totalPool),
        isExpired: timeRemaining <= 0,
      };
    });
  }, [activeMarketAddresses, marketResults]);

  return {
    markets,
    isLoading: isLoadingMarkets,
    refetch,
  };
}
