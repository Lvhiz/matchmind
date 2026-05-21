import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  MIN_STAKE,
  MAX_STAKE,
  createMarket,
  deployCore,
  expectedPayout,
  fundAndApprove,
  resolveViaRelayer,
} from "./helpers";

describe("PredictionMarket", function () {
  describe("stake()", function () {
    it("reverts below MIN_STAKE (0.01 USDT)", async function () {
      const { factory, agent, alice, usdt } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr);

      await expect(
        market.connect(alice).stake(true, MIN_STAKE - 1n)
      ).to.be.revertedWithCustomError(market, "InvalidStakeAmount");
    });

    it("reverts above MAX_STAKE (5 USDT)", async function () {
      const { factory, agent, alice, usdt } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr);

      await expect(
        market.connect(alice).stake(true, MAX_STAKE + 1n)
      ).to.be.revertedWithCustomError(market, "InvalidStakeAmount");
    });

    it("succeeds at MIN_STAKE (0.01 USDT)", async function () {
      const { factory, agent, alice, usdt } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr);

      await expect(market.connect(alice).stake(true, MIN_STAKE))
        .to.emit(market, "Staked")
        .withArgs(alice.address, true, MIN_STAKE);

      const [side, amount] = await market.getUserStake(alice.address);
      expect(side).to.equal(true);
      expect(amount).to.equal(MIN_STAKE);
    });

    it("succeeds at MAX_STAKE (5 USDT)", async function () {
      const { factory, agent, alice, usdt } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr, MAX_STAKE);

      await expect(market.connect(alice).stake(false, MAX_STAKE))
        .to.emit(market, "Staked")
        .withArgs(alice.address, false, MAX_STAKE);

      expect(await market.noPool()).to.equal(MAX_STAKE);
    });

    it("reverts after expiry", async function () {
      const { factory, agent, alice, usdt } = await deployCore();
      const { market, marketAddr, expiry } = await createMarket(
        factory,
        agent,
        "Late stake?",
        5n,
        3600
      );
      await fundAndApprove(usdt, alice, marketAddr);

      await time.increaseTo(expiry);
      await expect(
        market.connect(alice).stake(true, MIN_STAKE)
      ).to.be.revertedWithCustomError(market, "MarketExpired");
    });
  });

  describe("resolve()", function () {
    it("reverts when caller is not oracle", async function () {
      const { factory, agent, alice, stranger, usdt } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr);
      await market.connect(alice).stake(true, 100_000n);

      await expect(
        market.connect(stranger).resolve(true)
      ).to.be.revertedWithCustomError(market, "NotOracle");
    });
  });

  describe("claim()", function () {
    it("YES winner receives correct payout after resolve(true)", async function () {
      const { factory, agent, alice, bob, usdt, relayer } = await deployCore();
      const feePct = 5n;
      const { market, marketAddr } = await createMarket(
        factory,
        agent,
        "Yes wins",
        feePct
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await fundAndApprove(usdt, bob, marketAddr);

      const yesStake = 100_000n;
      const noStake = 200_000n;
      await market.connect(alice).stake(true, yesStake);
      await market.connect(bob).stake(false, noStake);

      await resolveViaRelayer(relayer, agent, marketAddr, true);

      const { payout } = expectedPayout(yesStake, yesStake, noStake, feePct);
      const before = await usdt.balanceOf(alice.address);

      await expect(market.connect(alice).claim())
        .to.emit(market, "Claimed")
        .withArgs(alice.address, payout);

      expect(await usdt.balanceOf(alice.address) - before).to.equal(payout);
    });

    it("NO winner receives correct payout after resolve(false)", async function () {
      const { factory, agent, alice, bob, usdt, relayer } = await deployCore();
      const feePct = 5n;
      const { market, marketAddr } = await createMarket(
        factory,
        agent,
        "No wins",
        feePct
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await fundAndApprove(usdt, bob, marketAddr);

      const yesStake = 300_000n;
      const noStake = 100_000n;
      await market.connect(alice).stake(true, yesStake);
      await market.connect(bob).stake(false, noStake);

      await resolveViaRelayer(relayer, agent, marketAddr, false);

      const { payout } = expectedPayout(noStake, noStake, yesStake, feePct);
      const before = await usdt.balanceOf(bob.address);

      await market.connect(bob).claim();
      expect(await usdt.balanceOf(bob.address) - before).to.equal(payout);
    });

    it("reverts on double claim", async function () {
      const { factory, agent, alice, bob, usdt, relayer } = await deployCore();
      const { market, marketAddr } = await createMarket(factory, agent);
      await fundAndApprove(usdt, alice, marketAddr);
      await fundAndApprove(usdt, bob, marketAddr);

      await market.connect(alice).stake(true, 100_000n);
      await market.connect(bob).stake(false, 50_000n);
      await resolveViaRelayer(relayer, agent, marketAddr, true);

      await market.connect(alice).claim();
      await expect(
        market.connect(alice).claim()
      ).to.be.revertedWithCustomError(market, "AlreadyClaimed");
    });

    it("deducts fee and sends it to feeRecipient", async function () {
      const { factory, agent, alice, bob, usdt, relayer, feeRecipient } =
        await deployCore();
      const feePct = 5n;
      const { market, marketAddr } = await createMarket(
        factory,
        agent,
        "Fee test",
        feePct
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await fundAndApprove(usdt, bob, marketAddr);

      const yesStake = 100_000n;
      const noStake = 200_000n;
      await market.connect(alice).stake(true, yesStake);
      await market.connect(bob).stake(false, noStake);
      await resolveViaRelayer(relayer, agent, marketAddr, true);

      const { fee } = expectedPayout(yesStake, yesStake, noStake, feePct);
      const feeBefore = await usdt.balanceOf(feeRecipient.address);

      await market.connect(alice).claim();

      expect(await usdt.balanceOf(feeRecipient.address) - feeBefore).to.equal(
        fee
      );
    });
  });

  describe("emergencyRefund()", function () {
    it("refunds all stakers 48hrs after expiry when unresolved", async function () {
      const { factory, agent, owner, alice, bob, usdt } = await deployCore();
      const { market, marketAddr, expiry } = await createMarket(
        factory,
        agent,
        "Emergency",
        5n,
        3600
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await fundAndApprove(usdt, bob, marketAddr);

      const aliceStake = 50_000n;
      const bobStake = 80_000n;
      await market.connect(alice).stake(true, aliceStake);
      await market.connect(bob).stake(false, bobStake);

      const aliceBefore = await usdt.balanceOf(alice.address);
      const bobBefore = await usdt.balanceOf(bob.address);

      await time.increaseTo(expiry + 48 * 60 * 60 + 1);
      await market.connect(owner).emergencyRefund();

      expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(
        aliceStake
      );
      expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(bobStake);
      expect(await market.getTotalPool()).to.equal(0n);
    });

    it("reverts when caller is not admin", async function () {
      const { factory, agent, stranger, alice, usdt } = await deployCore();
      const { market, marketAddr, expiry } = await createMarket(
        factory,
        agent,
        "Not admin",
        5n,
        3600
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await market.connect(alice).stake(true, MIN_STAKE);

      await time.increaseTo(expiry + 48 * 60 * 60 + 1);
      await expect(
        market.connect(stranger).emergencyRefund()
      ).to.be.revertedWithCustomError(market, "NotAdmin");
    });

    it("reverts before 48hr window", async function () {
      const { factory, agent, owner, alice, usdt } = await deployCore();
      const { market, marketAddr, expiry } = await createMarket(
        factory,
        agent,
        "Too early",
        5n,
        3600
      );
      await fundAndApprove(usdt, alice, marketAddr);
      await market.connect(alice).stake(true, MIN_STAKE);

      await time.increaseTo(expiry + 1);
      await expect(
        market.connect(owner).emergencyRefund()
      ).to.be.revertedWithCustomError(market, "EmergencyRefundNotAvailable");
    });
  });
});
