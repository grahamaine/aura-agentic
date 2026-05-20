require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Strip 0x prefix, BOM, whitespace, carriage returns — keep only hex chars
const pk = (process.env.PRIVATE_KEY || "").replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    somnia_mainnet: {
      url: process.env.SOMNIA_MAINNET_RPC || "https://api.infra.mainnet.somnia.network/",
      chainId: 5031,
      accounts: pk ? [pk] : [],
    },
    somnia_testnet: {
      url: process.env.SOMNIA_TESTNET_RPC || "https://api.infra.testnet.somnia.network/",
      chainId: 50312,
      accounts: pk ? [pk] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
