const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentMesh Protocol", function () {
  let owner, poster, agentA, agentB, verifierWallet;
  let registry, vault, market;

  const MIN_STAKE = ethers.parseEther("0.001");
  const REWARD    = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, poster, agentA, agentB, verifierWallet] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.deploy();

    const Vault = await ethers.getContractFactory("AgentVault");
    vault = await Vault.deploy(owner.address);

    const Market = await ethers.getContractFactory("TaskMarket");
    market = await Market.deploy(await registry.getAddress(), await vault.getAddress());

    // Wire up permissions
    await registry.setTrustedCaller(await market.getAddress(), true);
    await vault.setTrustedCaller(await market.getAddress(), true);
    await market.setVerifier(verifierWallet.address);
  });

  // ── Registration ────────────────────────────────────────────────────────

  describe("Agent Registration", function () {
    it("registers an agent with stake", async function () {
      await registry.connect(agentA).register("ResearchBot", "agent://0x01", [0], { value: MIN_STAKE });
      const profile = await registry.getAgent(agentA.address);
      expect(profile.name).to.equal("ResearchBot");
      expect(profile.stake).to.equal(MIN_STAKE);
      expect(Number(profile.reputation)).to.equal(500);
      expect(Number(profile.status)).to.equal(1); // Active
    });

    it("rejects duplicate registration", async function () {
      await registry.connect(agentA).register("Bot1", "agent://0x01", [0], { value: MIN_STAKE });
      await expect(
        registry.connect(agentA).register("Bot2", "agent://0x02", [0], { value: MIN_STAKE })
      ).to.be.revertedWith("Already registered");
    });

    it("rejects registration below min stake", async function () {
      await expect(
        registry.connect(agentA).register("Cheap", "agent://cheap", [0], { value: 1n })
      ).to.be.revertedWith("Insufficient stake");
    });

    it("lists agents by capability", async function () {
      await registry.connect(agentA).register("Researcher", "ep", [0], { value: MIN_STAKE });
      await registry.connect(agentB).register("Coder",      "ep", [1], { value: MIN_STAKE });

      const researchers = await registry.getAgentsByCapability(0);
      const coders      = await registry.getAgentsByCapability(1);

      expect(researchers).to.include(agentA.address);
      expect(coders).to.include(agentB.address);
    });
  });

  // ── Task Lifecycle ───────────────────────────────────────────────────────

  describe("Task Lifecycle", function () {
    beforeEach(async function () {
      // Register two agents
      await registry.connect(agentA).register("AgentA", "ep://a", [0], { value: MIN_STAKE });
      await registry.connect(agentB).register("AgentB", "ep://b", [0], { value: MIN_STAKE });
    });

    it("posts a task and escrows reward", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const tx = await market.connect(poster).postTask(
        "Research Somnia", "Deep dive", "{}", 0, deadline, 1,
        { value: REWARD }
      );
      const receipt = await tx.wait();

      const taskId = 1n;
      const task = await market.getTask(taskId);
      expect(task.status).to.equal(0n); // Open
      expect(task.reward).to.equal(REWARD);

      // Funds escrowed
      expect(await vault.getEscrow(taskId)).to.equal(REWARD);
    });

    it("completes full lifecycle: post → bid → assign → result → verify → pay", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await market.connect(poster).postTask(
        "Test Task", "Description", "{}", 0, deadline, 0,
        { value: REWARD }
      );
      const taskId = 1n;

      // Both agents bid
      await market.connect(agentA).submitBid(taskId);
      await market.connect(agentB).submitBid(taskId);

      // Poster assigns agentA
      await market.connect(poster).assignTask(taskId, agentA.address);
      expect((await market.getTask(taskId)).status).to.equal(1n); // Assigned

      // Agent submits result
      await market.connect(agentA).submitResult(taskId, '{"result":"great answer"}');
      expect((await market.getTask(taskId)).status).to.equal(3n); // PendingVerification

      // Verifier scores and pays
      const agentABefore = await ethers.provider.getBalance(agentA.address);
      await market.connect(verifierWallet).verifyAndPay(taskId, 85);

      const task = await market.getTask(taskId);
      expect(task.status).to.equal(4n); // Completed
      expect(task.qualityScore).to.equal(85n);

      // Agent received payment (85% of reward)
      const agentAAfter = await ethers.provider.getBalance(agentA.address);
      expect(agentAAfter).to.be.gt(agentABefore);
    });

    it("disputes low-quality results", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await market.connect(poster).postTask("Task", "Desc", "{}", 0, deadline, 0, { value: REWARD });
      const taskId = 1n;

      await market.connect(agentA).submitBid(taskId);
      await market.connect(poster).assignTask(taskId, agentA.address);
      await market.connect(agentA).submitResult(taskId, "bad result");
      await market.connect(verifierWallet).verifyAndPay(taskId, 40); // below MIN_QUALITY (60)

      const task = await market.getTask(taskId);
      expect(task.status).to.equal(5n); // Disputed
    });

    it("updates agent reputation after completion", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await market.connect(poster).postTask("T", "D", "{}", 0, deadline, 0, { value: REWARD });
      const taskId = 1n;

      await market.connect(agentA).submitBid(taskId);
      await market.connect(poster).assignTask(taskId, agentA.address);
      await market.connect(agentA).submitResult(taskId, "good result");
      await market.connect(verifierWallet).verifyAndPay(taskId, 90);

      const profile = await registry.getAgent(agentA.address);
      expect(Number(profile.reputation)).to.be.gt(500); // started at 500, should increase
      expect(Number(profile.completedTasks)).to.equal(1);
    });
  });

  // ── Vault ────────────────────────────────────────────────────────────────

  describe("AgentVault", function () {
    it("refunds poster when task is cancelled after deadline", async function () {
      // Use block.timestamp as reference so Hardhat's internal clock is accurate
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 30;
      await market.connect(poster).postTask("Expiring", "D", "{}", 0, deadline, 0, { value: REWARD });
      const taskId = 1n;

      // Advance time past the deadline
      await ethers.provider.send("evm_increaseTime", [60]);
      await ethers.provider.send("evm_mine", []);

      const balBefore = await ethers.provider.getBalance(poster.address);
      await market.connect(poster).cancelTask(taskId);
      const balAfter = await ethers.provider.getBalance(poster.address);

      expect(balAfter).to.be.gt(balBefore);
      expect(await vault.getEscrow(taskId)).to.equal(0n);
    });
  });
});
