import { expect } from "chai";
import { ethers } from "hardhat";
import {
  createMarket,
  deployCore,
  fundAndApprove,
  resolveViaRelayer,
  signResolution,
} from "./helpers";

describe("OracleRelayer", function () {
  it("valid agent signature resolves correctly", async function () {
    const { factory, agent, alice, usdt, relayer } = await deployCore();
    const { market, marketAddr } = await createMarket(factory, agent);
    await fundAndApprove(usdt, alice, marketAddr);
    await market.connect(alice).stake(true, 100_000n);

    const signature = await signResolution(agent, marketAddr, true, relayer);
    await expect(relayer.resolveMarket(marketAddr, true, signature)).to.emit(
      relayer,
      "MarketResolved"
    );

    expect(await market.resolved()).to.equal(true);
    expect(await market.winningSide()).to.equal(true);
  });

  it("wrong signer reverts", async function () {
    const { factory, agent, bob, usdt, relayer } = await deployCore();
    const { market, marketAddr } = await createMarket(factory, agent);
    await fundAndApprove(usdt, agent, marketAddr);

    const signature = await signResolution(bob, marketAddr, true, relayer);

    await expect(
      relayer.resolveMarket(marketAddr, true, signature)
    ).to.be.revertedWithCustomError(relayer, "InvalidSignature");
  });

  it("replayed signature reverts on second resolve", async function () {
    const { factory, agent, alice, usdt, relayer } = await deployCore();
    const { market, marketAddr } = await createMarket(factory, agent);
    await fundAndApprove(usdt, alice, marketAddr);
    await market.connect(alice).stake(true, 100_000n);

    const signature = await signResolution(agent, marketAddr, true, relayer);
    await relayer.resolveMarket(marketAddr, true, signature);

    await expect(
      relayer.resolveMarket(marketAddr, true, signature)
    ).to.be.revertedWithCustomError(relayer, "MarketAlreadyResolved");
  });
});
