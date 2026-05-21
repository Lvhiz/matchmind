import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const XLAYER_MAINNET_RPC =
  process.env.XLAYER_MAINNET_RPC ?? "https://rpc.xlayer.tech";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    xlayer: {
      url: XLAYER_MAINNET_RPC,
      chainId: 196,
      accounts: process.env.AGENT_PRIVATE_KEY
        ? [process.env.AGENT_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      xlayer: "no-api-key-needed",
    },
    customChains: [
      {
        network: "xlayer",
        chainId: 196,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLayer",
          browserURL: "https://www.oklink.com/xlayer",
        },
      },
    ],
  },
};

export default config;
