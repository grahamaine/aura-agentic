/**
 * setup_chain.js — Post-deployment wiring.
 *
 * 1. Sets the Verifier agent address on TaskMarket
 *
 * Usage: npx hardhat run scripts/setup_chain.js --network somnia_testnet
 */

const { ethers } = require("hardhat");

const TASK_MARKET   = "0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA";
const VERIFIER_ADDR = "0xC1fD7a69395FA3e7006968431f77EF0245aB009A"; // Verifier-1 wallet

const MARKET_ABI = [
  "function setVerifier(address v) external",
  "function verifierAgent() external view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const market = new ethers.Contract(TASK_MARKET, MARKET_ABI, deployer);

  const current = await market.verifierAgent();
  console.log("Current verifier:", current);

  if (current.toLowerCase() === VERIFIER_ADDR.toLowerCase()) {
    console.log("✓ Verifier already set correctly.");
    return;
  }

  console.log("Setting verifier to:", VERIFIER_ADDR);
  const tx = await market.setVerifier(VERIFIER_ADDR);
  await tx.wait();
  console.log("✓ Verifier set — tx:", tx.hash);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
