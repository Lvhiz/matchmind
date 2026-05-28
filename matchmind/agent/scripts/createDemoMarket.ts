const dotenv = require('dotenv');
dotenv.config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const rpc = process.env.XLAYER_MAINNET_RPC || 'https://rpc.xlayer.tech';
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log('Agent wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('OKB balance:', ethers.formatEther(balance));

  const depPath = path.join(__dirname, '../../shared/deployments.json');
  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));

  const abiPath = path.join(__dirname, '../../shared/abis/MarketFactory.json');
  const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  const factory = new ethers.Contract(dep.marketFactory, abi, wallet);

  const markets = [
    "Will Brazil score in the next 7 minutes?",
    "Will there be a yellow card in the next 5 minutes?",
    "Will Argentina have more possession in the next 5 minutes?"
  ];

  for (const question of markets) {
    try {
      const expiry = Math.floor(Date.now() / 1000) + 420;
      console.log('Creating market:', question);
      const tx = await factory.createMarket(question, expiry, 2);
      console.log('TX:', tx.hash);
      console.log('OKLink: https://www.oklink.com/xlayer/tx/' + tx.hash);
      await tx.wait(1);
      console.log('Market created!');
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
  console.log('Done! https://matchmind-gf9l.vercel.app');
}

main().catch(console.error);
