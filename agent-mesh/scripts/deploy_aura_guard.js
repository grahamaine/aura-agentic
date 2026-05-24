/**
 * Deploy AuraGuard contracts to Somnia testnet.
 *
 * Deploys:
 *   - RiskRegistry  (on-chain risk score ledger)
 *   - VulnerableHoneyToken (demo-only rug pull contract for live demonstrations)
 *
 * Usage:
 *   npx hardhat run scripts/deploy_aura_guard.js --network somnia_testnet
 *
 * Prerequisites:
 *   - Run scripts/deploy.js first (AgentRegistry, AgentVault, TaskMarket)
 *   - Set PRIVATE_KEY and AUDIT_ORCHESTRATOR_ADDRESS in .env
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();

  console.log("\n" + "═".repeat(60));
  console.log("  AuraGuard Deployment");
  console.log("═".repeat(60));
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(balance)} STT`);
  console.log(`  Network   : ${network.name} (chain ${network.chainId})`);
  console.log("═".repeat(60));

  if (balance < ethers.parseEther("0.005")) {
    throw new Error("Insufficient balance. Need at least 0.005 STT.");
  }

  // ── 1. Deploy RiskRegistry ─────────────────────────────────────────────────
  console.log("\n[1/2] Deploying RiskRegistry...");
  const RiskRegistry = await ethers.getContractFactory("RiskRegistry");
  const riskRegistry = await RiskRegistry.deploy();
  await riskRegistry.waitForDeployment();
  const riskRegistryAddr = await riskRegistry.getAddress();
  console.log(`      ✅ RiskRegistry:       ${riskRegistryAddr}`);

  // ── 2. Authorize AuditOrchestrator as a scanner ────────────────────────────
  const orchestratorAddr = process.env.AUDIT_ORCHESTRATOR_ADDRESS;
  if (orchestratorAddr) {
    console.log(`\n      Authorizing AuditOrchestrator: ${orchestratorAddr}`);
    await riskRegistry.setScanner(orchestratorAddr, true);
    console.log(`      ✅ AuditOrchestrator authorized as scanner`);
  } else {
    console.log(`\n      ⚠️  AUDIT_ORCHESTRATOR_ADDRESS not set — authorize manually later:`);
    console.log(`         riskRegistry.setScanner(<orchestrator_wallet>, true)`);
  }

  // ── 3. Deploy VulnerableHoneyToken (DEMO ONLY) ─────────────────────────────
  console.log("\n[2/2] Deploying VulnerableHoneyToken (DEMO)...");
  const HoneyToken = await ethers.getContractFactory("VulnerableHoneyToken");
  const honeyToken = await HoneyToken.deploy(ethers.parseUnits("1000000", 0)); // 1M tokens
  await honeyToken.waitForDeployment();
  const honeyTokenAddr = await honeyToken.getAddress();
  console.log(`      ✅ VulnerableHoneyToken: ${honeyTokenAddr}`);
  console.log(`         ⚠️  THIS IS THE DEMO RUG PULL CONTRACT — DO NOT USE WITH REAL FUNDS`);

  // ── Save addresses ─────────────────────────────────────────────────────────
  const existingPath = path.join(__dirname, "../artifacts/deployed.json");
  let existing = {};
  if (fs.existsSync(existingPath)) {
    existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
  }

  const updatedAddresses = {
    ...existing,
    auraGuardDeployedAt: new Date().toISOString(),
    contracts: {
      ...(existing.contracts || {}),
      RiskRegistry:          riskRegistryAddr,
      VulnerableHoneyToken:  honeyTokenAddr,
    },
  };

  fs.writeFileSync(existingPath, JSON.stringify(updatedAddresses, null, 2));
  console.log(`\n      Addresses saved to: ${existingPath}`);

  // ── Print .env snippet ─────────────────────────────────────────────────────
  const envSnippet = `
# AuraGuard Contract Addresses (${updatedAddresses.auraGuardDeployedAt})
RISK_REGISTRY_ADDRESS=${riskRegistryAddr}
HONEY_TOKEN_ADDRESS=${honeyTokenAddr}
`;
  console.log("\n" + "═".repeat(60));
  console.log("Add these to your .env file:");
  console.log("═".repeat(60));
  console.log(envSnippet);

  console.log("═".repeat(60));
  console.log("Explorer links:");
  console.log(`  RiskRegistry:    https://shannon-explorer.somnia.network/address/${riskRegistryAddr}`);
  console.log(`  HoneyToken:      https://shannon-explorer.somnia.network/address/${honeyTokenAddr}`);
  console.log("═".repeat(60));

  // ── Print next steps ───────────────────────────────────────────────────────
  console.log(`
NEXT STEPS:
  1. Add addresses above to .env
  2. Launch AuraGuard swarm:
       python scripts/launch_aura_guard.py
  3. Run the live demo:
       python scripts/demo_aura_guard.py
  4. Open the dashboard:
       dashboard/index.html (update RISK_REGISTRY_ADDRESS inside)
`);

  return updatedAddresses;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
