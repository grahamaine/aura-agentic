/**
 * Deploy AgentMesh contracts to Somnia testnet (or local Hardhat node).
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network somnia_testnet
 *   npx hardhat run scripts/deploy.js --network localhost
 *
 * After deployment, copy the addresses into your .env file.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log("AuraAgentic Deployment");
  console.log("=".repeat(60));
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} STT`);
  console.log(`Network:   ${(await ethers.provider.getNetwork()).name}`);
  console.log("=".repeat(60));

  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Insufficient balance. Need at least 0.01 STT for deployment.");
  }

  // ── 1. Deploy AgentRegistry ──────────────────────────────────────────────
  console.log("\n[1/3] Deploying AgentRegistry...");
  const Registry = await ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`      AgentRegistry deployed: ${registryAddr}`);

  // ── 2. Deploy AgentVault ─────────────────────────────────────────────────
  console.log("\n[2/3] Deploying AgentVault...");
  const Vault = await ethers.getContractFactory("AgentVault");
  const vault = await Vault.deploy(deployer.address); // treasury = deployer for demo
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`      AgentVault deployed:    ${vaultAddr}`);

  // ── 3. Deploy TaskMarket ─────────────────────────────────────────────────
  console.log("\n[3/3] Deploying TaskMarket...");
  const Market = await ethers.getContractFactory("TaskMarket");
  const market = await Market.deploy(registryAddr, vaultAddr);
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log(`      TaskMarket deployed:    ${marketAddr}`);

  // ── Wire up permissions ──────────────────────────────────────────────────
  console.log("\nWiring permissions...");
  await registry.setTrustedCaller(marketAddr, true);
  await vault.setTrustedCaller(marketAddr, true);
  console.log("      TaskMarket trusted in Registry and Vault.");

  // ── Save addresses ───────────────────────────────────────────────────────
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      AgentRegistry: registryAddr,
      AgentVault: vaultAddr,
      TaskMarket: marketAddr,
    },
  };

  const outPath = path.join(__dirname, "../artifacts/deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved to: ${outPath}`);

  // ── Also write a .env snippet ────────────────────────────────────────────
  const envSnippet = `
# AgentMesh Contract Addresses (${addresses.deployedAt})
AGENT_REGISTRY_ADDRESS=${registryAddr}
AGENT_VAULT_ADDRESS=${vaultAddr}
TASK_MARKET_ADDRESS=${marketAddr}
`;
  console.log("\n" + "=".repeat(60));
  console.log("Add these to your .env file:");
  console.log("=".repeat(60));
  console.log(envSnippet);

  // ── Verify on Somnia explorer (if available) ─────────────────────────────
  console.log("=".repeat(60));
  console.log("Explorer links:");
  console.log(`  [Testnet]  https://shannon-explorer.somnia.network/address/${registryAddr}`);
  console.log(`  [Mainnet]  https://explorer.somnia.network/address/${registryAddr}`);
  console.log("=".repeat(60));

  return addresses;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
