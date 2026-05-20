/**
 * fund_agents.js — Send STT from deployer wallet to all 5 agent wallets.
 * Usage: npx hardhat run scripts/fund_agents.js --network somnia_testnet
 */

const { ethers } = require("hardhat");

const AGENTS = [
  { name: "Orchestrator", address: "0x7dE9de93C85e59bF32f88Bb9a69588f45EeE7F9D" },
  { name: "Researcher",   address: "0xb76C7e5b2C965DeD64d6FC004d4B21FFE66b034f" },
  { name: "Coder",        address: "0x4687098345D4B6d405d8ffC863700A688F2B59e0" },
  { name: "Analyst",      address: "0xfd6b1aEC2013a758CF8c489f049ADC9314158E11" },
  { name: "Verifier",     address: "0xC1fD7a69395FA3e7006968431f77EF0245aB009A" },
];

const AMOUNT = ethers.parseEther("0.05"); // 0.05 STT each = 0.25 STT total

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(50));
  console.log("AuraAgentic — Fund Agent Wallets");
  console.log("=".repeat(50));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} STT`);
  console.log(`Sending:  ${ethers.formatEther(AMOUNT)} STT to each of ${AGENTS.length} agents`);
  console.log(`Total:    ${ethers.formatEther(AMOUNT * BigInt(AGENTS.length))} STT`);
  console.log("=".repeat(50));

  const needed = AMOUNT * BigInt(AGENTS.length);
  if (balance < needed) {
    throw new Error(`Insufficient balance. Need ${ethers.formatEther(needed)} STT, have ${ethers.formatEther(balance)} STT`);
  }

  for (const agent of AGENTS) {
    process.stdout.write(`Funding ${agent.name} (${agent.address})... `);
    const tx = await deployer.sendTransaction({ to: agent.address, value: AMOUNT });
    await tx.wait();
    console.log(`✓  tx: ${tx.hash}`);
  }

  console.log("\n✅ All agents funded!");
  console.log("Run: python run_agents.py");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
