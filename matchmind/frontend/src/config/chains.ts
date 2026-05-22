import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  okxWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";

export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: {
    default: {
      name: "OKLink",
      url: "https://www.oklink.com/xlayer",
    },
  },
});

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, okxWallet, walletConnectWallet],
    },
  ],
  {
    appName: "MatchMind",
    projectId,
  }
);

export const config = createConfig({
  chains: [xlayer],
  connectors,
  transports: {
    [xlayer.id]: http("https://rpc.xlayer.tech"),
  },
  ssr: true,
});
