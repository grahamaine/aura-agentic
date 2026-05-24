/**
 * RiskRegistry Test Suite
 *
 * Verifies: risk recording, authorization, query functions,
 * counters, and the VulnerableHoneyToken demo contract.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuraGuard — RiskRegistry", function () {
  let riskRegistry;
  let owner, scanner, unauthorized, user;

  beforeEach(async () => {
    [owner, scanner, unauthorized, user] = await ethers.getSigners();

    const RiskRegistry = await ethers.getContractFactory("RiskRegistry");
    riskRegistry = await RiskRegistry.deploy();
    await riskRegistry.waitForDeployment();
  });

  // ── Authorization ────────────────────────────────────────────────────────────

  describe("Authorization", () => {
    it("owner can authorize a scanner", async () => {
      await riskRegistry.setScanner(scanner.address, true);
      expect(await riskRegistry.authorizedScanners(scanner.address)).to.be.true;
    });

    it("owner can revoke a scanner", async () => {
      await riskRegistry.setScanner(scanner.address, true);
      await riskRegistry.setScanner(scanner.address, false);
      expect(await riskRegistry.authorizedScanners(scanner.address)).to.be.false;
    });

    it("non-owner cannot authorize scanners", async () => {
      await expect(
        riskRegistry.connect(unauthorized).setScanner(scanner.address, true)
      ).to.be.reverted;
    });
  });

  // ── Risk Recording ───────────────────────────────────────────────────────────

  describe("Risk Recording", () => {
    const fakeContract = "0x1234567890123456789012345678901234567890";

    beforeEach(async () => {
      await riskRegistry.setScanner(scanner.address, true);
    });

    it("authorized scanner can record a risk report", async () => {
      await riskRegistry.connect(scanner).recordRisk(
        fakeContract, 95, 90, 42, "💀 CRITICAL: Unlimited mint + LP drain"
      );

      const report = await riskRegistry.getReport(fakeContract);
      expect(report.exists).to.be.true;
      expect(report.riskScore).to.equal(95);
      expect(report.confidence).to.equal(90);
      expect(report.taskId).to.equal(42);
      expect(report.scanner).to.equal(scanner.address);
      expect(report.summary).to.equal("💀 CRITICAL: Unlimited mint + LP drain");
    });

    it("owner can record without being an authorized scanner", async () => {
      await riskRegistry.recordRisk(fakeContract, 50, 80, 1, "Medium risk");
      const report = await riskRegistry.getReport(fakeContract);
      expect(report.exists).to.be.true;
    });

    it("unauthorized wallet cannot record risk", async () => {
      await expect(
        riskRegistry.connect(unauthorized).recordRisk(
          fakeContract, 95, 90, 42, "Fake report"
        )
      ).to.be.revertedWith("Not authorized scanner");
    });

    it("rejects riskScore > 100", async () => {
      await expect(
        riskRegistry.connect(scanner).recordRisk(fakeContract, 101, 80, 1, "bad")
      ).to.be.revertedWith("Score out of range");
    });

    it("rejects confidence > 100", async () => {
      await expect(
        riskRegistry.connect(scanner).recordRisk(fakeContract, 95, 101, 1, "bad")
      ).to.be.revertedWith("Confidence out of range");
    });

    it("rejects summary longer than 512 chars", async () => {
      const longSummary = "x".repeat(513);
      await expect(
        riskRegistry.connect(scanner).recordRisk(fakeContract, 50, 80, 1, longSummary)
      ).to.be.revertedWith("Summary too long");
    });

    it("emits ContractScanned event", async () => {
      await expect(
        riskRegistry.connect(scanner).recordRisk(fakeContract, 80, 85, 7, "High risk")
      ).to.emit(riskRegistry, "ContractScanned")
        .withArgs(fakeContract, 80, 85, 7, scanner.address, "High risk");
    });
  });

  // ── Counters ─────────────────────────────────────────────────────────────────

  describe("Counters", () => {
    const contracts = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];

    beforeEach(async () => {
      await riskRegistry.setScanner(scanner.address, true);
    });

    it("tracks totalScanned correctly", async () => {
      expect(await riskRegistry.totalScanned()).to.equal(0);
      await riskRegistry.connect(scanner).recordRisk(contracts[0], 95, 90, 1, "Critical");
      expect(await riskRegistry.totalScanned()).to.equal(1);
      await riskRegistry.connect(scanner).recordRisk(contracts[1], 20, 95, 2, "Safe");
      expect(await riskRegistry.totalScanned()).to.equal(2);
    });

    it("does not double-count re-scans of same contract", async () => {
      await riskRegistry.connect(scanner).recordRisk(contracts[0], 95, 90, 1, "First scan");
      await riskRegistry.connect(scanner).recordRisk(contracts[0], 40, 85, 2, "Re-scan");
      expect(await riskRegistry.totalScanned()).to.equal(1);
    });

    it("tracks criticalCount for scores >= 90", async () => {
      expect(await riskRegistry.criticalCount()).to.equal(0);
      await riskRegistry.connect(scanner).recordRisk(contracts[0], 92, 90, 1, "Critical!");
      expect(await riskRegistry.criticalCount()).to.equal(1);
      await riskRegistry.connect(scanner).recordRisk(contracts[1], 45, 80, 2, "Medium");
      expect(await riskRegistry.criticalCount()).to.equal(1);
    });
  });

  // ── Query Functions ──────────────────────────────────────────────────────────

  describe("Query Functions", () => {
    const addrs = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];

    beforeEach(async () => {
      await riskRegistry.setScanner(scanner.address, true);
      for (let i = 0; i < addrs.length; i++) {
        await riskRegistry.connect(scanner).recordRisk(addrs[i], 30 * (i + 1), 80, i + 1, `Report ${i + 1}`);
      }
    });

    it("getRecentScans returns newest first", async () => {
      const recent = await riskRegistry.getRecentScans(2);
      expect(recent).to.have.length(2);
      expect(recent[0].toLowerCase()).to.equal(addrs[2].toLowerCase()); // newest
      expect(recent[1].toLowerCase()).to.equal(addrs[1].toLowerCase());
    });

    it("getRecentScans caps at available count", async () => {
      const recent = await riskRegistry.getRecentScans(10);
      expect(recent).to.have.length(3);
    });

    it("isScanned returns true for scanned contracts", async () => {
      expect(await riskRegistry.isScanned(addrs[0])).to.be.true;
    });

    it("isScanned returns false for unscanned contracts", async () => {
      const unscanned = "0x9999999999999999999999999999999999999999";
      expect(await riskRegistry.isScanned(unscanned)).to.be.false;
    });

    it("getRiskLabel returns correct labels", async () => {
      // Scores: 30 (LOW), 60 (MEDIUM), 90 (CRITICAL)
      const [label0] = await riskRegistry.getRiskLabel(addrs[0]);
      const [label1] = await riskRegistry.getRiskLabel(addrs[1]);
      const [label2] = await riskRegistry.getRiskLabel(addrs[2]);
      expect(label0).to.equal("LOW RISK");
      expect(label1).to.equal("MEDIUM");
      expect(label2).to.equal("CRITICAL");
    });
  });

  // ── Flag Recording ───────────────────────────────────────────────────────────

  describe("Vulnerability Flags", () => {
    // Use a valid checksummed address (computed via ethers.getAddress)
    let fakeContract;
    before(async () => {
      fakeContract = ethers.getAddress("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    });

    beforeEach(async () => {
      await riskRegistry.setScanner(scanner.address, true);
    });

    it("scanner can add vulnerability flags", async () => {
      await riskRegistry.connect(scanner).addFlag(
        fakeContract, "Unlimited Mint", 4, "Owner can mint unlimited tokens"
      );
      const flags = await riskRegistry.getFlags(fakeContract);
      expect(flags).to.have.length(1);
      expect(flags[0].category).to.equal("Unlimited Mint");
      expect(flags[0].severity).to.equal(4); // CRITICAL
    });

    it("emits FlagAdded event", async () => {
      await expect(
        riskRegistry.connect(scanner).addFlag(fakeContract, "Honeypot", 3, "Sell blacklist")
      ).to.emit(riskRegistry, "FlagAdded")
        .withArgs(fakeContract, "Honeypot", 3);
    });

    it("rejects severity > 4", async () => {
      await expect(
        riskRegistry.connect(scanner).addFlag(fakeContract, "Bad", 5, "nope")
      ).to.be.revertedWith("Severity out of range");
    });
  });
});

// ── VulnerableHoneyToken ─────────────────────────────────────────────────────

describe("AuraGuard — VulnerableHoneyToken (Demo)", function () {
  let token;
  let owner, user1, user2;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    const HoneyToken = await ethers.getContractFactory("VulnerableHoneyToken");
    token = await HoneyToken.deploy(1_000_000);
    await token.waitForDeployment();
  });

  it("deploys with correct initial supply", async () => {
    const supply = await token.totalSupply();
    const decimals = await token.decimals();
    expect(supply).to.equal(ethers.parseUnits("1000000", decimals));
  });

  it("VULN: owner can mint unlimited tokens (no cap)", async () => {
    const before = await token.totalSupply();
    await token.mint(user1.address, ethers.parseUnits("999999999", 18));
    const after = await token.totalSupply();
    expect(after).to.be.gt(before);
  });

  it("VULN: owner can raise sell tax to 99%", async () => {
    await token.setSellTax(99);
    expect(await token.sellTaxPercent()).to.equal(99);
  });

  it("VULN: owner can blacklist any address", async () => {
    await token.setBlacklist(user1.address, true);
    expect(await token.blacklisted(user1.address)).to.be.true;
  });

  it("VULN: blacklisted address cannot transfer (honeypot)", async () => {
    // Give user1 some tokens
    await token.transfer(user1.address, ethers.parseUnits("1000", 18));
    // Blacklist user1
    await token.setBlacklist(user1.address, true);
    // user1 can no longer sell/transfer
    await expect(
      token.connect(user1).transfer(user2.address, ethers.parseUnits("100", 18))
    ).to.be.revertedWith("Blacklisted: cannot sell");
  });

  it("VULN: transfer applies hidden sell tax", async () => {
    await token.setSellTax(10); // 10% tax
    const sendAmount = ethers.parseUnits("1000", 18);
    // After 10% tax, user1 receives 900 tokens
    await token.transfer(user1.address, sendAmount);
    const user1Balance = await token.balanceOf(user1.address);
    // user1 actually holds 90% of sendAmount (tax already taken on first transfer)
    expect(user1Balance).to.equal(sendAmount * 90n / 100n);

    // Now user1 sends their full balance; they receive 90% of that
    const user1Has = await token.balanceOf(user1.address);
    await token.connect(user1).transfer(user2.address, user1Has);
    const user2Balance = await token.balanceOf(user2.address);
    // user2 gets 90% of user1Has
    expect(user2Balance).to.equal(user1Has * 90n / 100n);
  });
});
