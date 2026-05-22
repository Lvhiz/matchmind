import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-tight">MatchMind</h1>
      <p className="max-w-md text-center text-neutral-600 dark:text-neutral-400">
        AI-powered football prediction oracle on X Layer mainnet.
      </p>
      <ConnectButton />
    </main>
  );
}
