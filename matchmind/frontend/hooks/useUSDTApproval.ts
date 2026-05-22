'use client'

import { useCallback, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { USDT_ADDRESS, usdtAbi } from "../lib/contracts";

const ZERO = BigInt(0);

export function useUSDTApproval(spenderAddress?: string) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [isApproving, setIsApproving] = useState(false);
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApprovalSuccess, setIsApprovalSuccess] = useState(false);

  const spender = spenderAddress as `0x${string}` | undefined;

  const allowanceRead = useReadContract({
    address: USDT_ADDRESS,
    abi: usdtAbi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    query: {
      enabled: Boolean(address && spender),
      refetchInterval: 12000,
    },
  });

  const approveUSDT = useCallback(
    async (marketAddress: string, amount: bigint) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      setIsApproving(true);
      setApprovalError(null);
      setIsApprovalSuccess(false);

      try {
        const hash = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: usdtAbi,
          functionName: "approve",
          args: [marketAddress as `0x${string}`, amount],
        });
        setApprovalHash(hash);

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await allowanceRead.refetch();
        setIsApprovalSuccess(true);
        return hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setApprovalError(message);
        throw error;
      } finally {
        setIsApproving(false);
      }
    },
    [address, allowanceRead, publicClient, writeContractAsync]
  );

  const isApproved = useCallback(
    (marketAddress: string, amount: bigint) => {
      const allowance = (allowanceRead.data as bigint | undefined) ?? ZERO;
      return allowance >= amount && Boolean(address) && Boolean(marketAddress);
    },
    [allowanceRead.data, address]
  );

  return {
    approveUSDT,
    isApproved,
    isApproving,
    approvalHash,
    approvalError,
    isApprovalSuccess,
  };
}
