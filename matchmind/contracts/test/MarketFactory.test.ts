import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { createMarket, deployCore, resolveViaRelayer } from "./helpers";

describe("MarketFactory", function () {
  it("only agent can createMarket", async function () {
    const { factory, agent, stranger } = await deployCore();
    const expiry = (await time.latest()) + 86400;

    await expect(
      factory.connect(stranger).createMarket("Hack?", expiry, 2)
    ).to.be.revertedWithCustomError(factory, "NotAgent");

    await expect(
      factory.connect(agent).createMarket("Legit?", expiry, 2)
    ).to.not.be.reverted;
  });

  it("createMarket emits MarketCreated with correct params", async function () {
    const { factory, agent } = await deployCore();
    const question = "Will it rain?";
    const expiry = (await time.latest()) + 7 * 24 * 60 * 60;
    const feePct = 3n;

    const tx = await factory.connect(agent).createMarket(question, expiry, feePct);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    const markets = await factory.getAllMarkets();
    const marketAddr = markets[markets.length - 1];

    await expect(tx)
      .to.emit(factory, "MarketCreated")
      .withArgs(marketAddr, question, expiry, block!.timestamp);
  });

  it("getActiveMarkets() filters resolved markets out", async function () {
    const { factory, agent, relayer } = await deployCore();

    const { marketAddr: m1 } = await createMarket(factory, agent, "M1");
    const { marketAddr: m2 } = await createMarket(factory, agent, "M2");

    await resolveViaRelayer(relayer, agent, m1, true);

    const active = await factory.getActiveMarkets();
    expect(active).to.have.lengthOf(1);
    expect(active[0].toLowerCase()).to.equal(m2.toLowerCase());
  });

  it("getAllMarkets() returns full history", async function () {
    const { factory, agent, relayer } = await deployCore();

    const { marketAddr: m1 } = await createMarket(factory, agent, "M1");
    const { marketAddr: m2 } = await createMarket(factory, agent, "M2");
    await resolveViaRelayer(relayer, agent, m1, true);

    const all = await factory.getAllMarkets();
    expect(all).to.have.lengthOf(2);
    expect(all[0].toLowerCase()).to.equal(m1.toLowerCase());
    expect(all[1].toLowerCase()).to.equal(m2.toLowerCase());
    expect(await factory.marketCount()).to.equal(2n);
  });
});
