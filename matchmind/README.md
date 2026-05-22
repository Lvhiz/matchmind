# MatchMind

AI-powered football prediction oracle on X Layer mainnet.

## Monorepo structure

| Package     | Description                          |
| ----------- | ------------------------------------ |
| `contracts` | Solidity / Hardhat smart contracts   |
| `agent`     | Node.js AI oracle agent              |
| `frontend`  | Next.js 14 web app                   |
| `shared`    | Shared ABIs and TypeScript types     |

## Contract addresses (X Layer mainnet)

| Contract | Address |
| -------- | ------- |
| Factory  | _TBD_   |
| Token    | _TBD_   |

## Environment

Copy `.env.example` to `.env` at the repo root and fill in the values.

## Getting started

```bash
# Contracts
cd contracts
npm install
npm run compile

# Agent
cd agent
npm install
npm run build

# Frontend
cd frontend
npm install
npm run dev
```
