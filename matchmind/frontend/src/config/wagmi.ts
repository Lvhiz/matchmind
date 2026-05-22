import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { xlayer } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "MatchMind",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [xlayer],
  ssr: true,
});
