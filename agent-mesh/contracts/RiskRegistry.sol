// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RiskRegistry
 * @notice On-chain risk score ledger populated by AuraGuard's autonomous agent swarm.
 *
 * Anyone can query any contract address to get its AI-generated risk score
 * BEFORE interacting with it. Scores are produced by staked agents — bad
 * assessments get slashed, so agents have skin in the game.
 *
 * Risk Scale:
 *   0 - 20  ✅  SAFE     — No significant vulnerabilities detected
 *  21 - 49  🟡  LOW      — Minor concerns, verify before large positions
 *  50 - 74  🟠  MEDIUM   — Notable risks, proceed with extreme caution
 *  75 - 89  🔴  HIGH     — Serious vulnerabilities, avoid unless expert
 *  90 - 100 💀  CRITICAL — Certain exploit / rug, do not interact
 *
 * Somnia-native design:
 *   Sub-second finality means a newly deployed contract gets a risk score
 *   within seconds — before most users have even seen the contract exist.
 *   On Ethereum (12s blocks) this would be too slow to matter.
 */
contract RiskRegistry is Ownable {

    // ── Data Types ────────────────────────────────────────────────────────────

    struct RiskReport {
        address contractAddr;   // the scanned contract
        uint8   riskScore;      // 0-100  (higher = more dangerous)
        uint8   confidence;     // 0-100  (agent's confidence in the score)
        uint256 taskId;         // AgentMesh TaskMarket task that produced this
        address scanner;        // AuditOrchestrator wallet that wrote this
        uint256 scannedAt;      // block.timestamp of scan
        string  summary;        // ≤ 512-char plain-English verdict
        bool    exists;         // false until first scan
    }

    struct VulnerabilityFlag {
        string  category;       // e.g. "Reentrancy", "Unlimited Mint", "Honeypot"
        uint8   severity;       // 0=Info 1=Low 2=Med 3=High 4=Critical
        string  description;
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    // contract address → latest risk report
    mapping(address => RiskReport) public reports;

    // contract address → list of individual flags (from sub-agents)
    mapping(address => VulnerabilityFlag[]) public flags;

    // chronological list of all scanned contracts (newest = last)
    address[] public scannedList;

    // deployer wallets of AuditOrchestrator agents
    mapping(address => bool) public authorizedScanners;

    uint256 public totalScanned;
    uint256 public criticalCount;   // contracts with riskScore >= 90

    // ── Events ────────────────────────────────────────────────────────────────

    event ContractScanned(
        address indexed contractAddr,
        uint8   riskScore,
        uint8   confidence,
        uint256 indexed taskId,
        address indexed scanner,
        string  summary
    );

    event FlagAdded(
        address indexed contractAddr,
        string  category,
        uint8   severity
    );

    event ScannerAuthorized(address indexed scanner, bool authorized);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setScanner(address scanner, bool authorized) external onlyOwner {
        authorizedScanners[scanner] = authorized;
        emit ScannerAuthorized(scanner, authorized);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Record a risk assessment for a contract.
     *         Called by the AuditOrchestrator after synthesising sub-agent results.
     */
    function recordRisk(
        address contractAddr,
        uint8   riskScore,
        uint8   confidence,
        uint256 taskId,
        string calldata summary
    ) external {
        require(
            authorizedScanners[msg.sender] || msg.sender == owner(),
            "Not authorized scanner"
        );
        require(riskScore  <= 100, "Score out of range");
        require(confidence <= 100, "Confidence out of range");
        require(bytes(summary).length <= 512, "Summary too long");

        bool isNew = !reports[contractAddr].exists;

        reports[contractAddr] = RiskReport({
            contractAddr: contractAddr,
            riskScore:    riskScore,
            confidence:   confidence,
            taskId:       taskId,
            scanner:      msg.sender,
            scannedAt:    block.timestamp,
            summary:      summary,
            exists:       true
        });

        if (isNew) {
            scannedList.push(contractAddr);
            totalScanned++;
            if (riskScore >= 90) criticalCount++;
        } else if (riskScore >= 90 && reports[contractAddr].riskScore < 90) {
            criticalCount++;
        }

        emit ContractScanned(
            contractAddr, riskScore, confidence, taskId, msg.sender, summary
        );
    }

    /**
     * @notice Add individual vulnerability flags (called per sub-agent finding).
     */
    function addFlag(
        address contractAddr,
        string calldata category,
        uint8   severity,
        string calldata description
    ) external {
        require(
            authorizedScanners[msg.sender] || msg.sender == owner(),
            "Not authorized scanner"
        );
        require(severity <= 4, "Severity out of range");

        flags[contractAddr].push(VulnerabilityFlag({
            category:    category,
            severity:    severity,
            description: description
        }));

        emit FlagAdded(contractAddr, category, severity);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    function getReport(address contractAddr)
        external view returns (RiskReport memory)
    {
        return reports[contractAddr];
    }

    function getFlags(address contractAddr)
        external view returns (VulnerabilityFlag[] memory)
    {
        return flags[contractAddr];
    }

    /**
     * @notice Return the N most recently scanned contract addresses.
     */
    function getRecentScans(uint256 count)
        external view returns (address[] memory)
    {
        uint256 len = scannedList.length;
        uint256 n   = count > len ? len : count;
        address[] memory result = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = scannedList[len - 1 - i];
        }
        return result;
    }

    function isScanned(address contractAddr) external view returns (bool) {
        return reports[contractAddr].exists;
    }

    function getRiskLabel(address contractAddr)
        external view returns (string memory label, uint8 score)
    {
        score = reports[contractAddr].riskScore;
        if (!reports[contractAddr].exists) return ("UNSCANNED", 0);
        if (score <= 20)  return ("SAFE",     score);
        if (score <= 49)  return ("LOW RISK", score);
        if (score <= 74)  return ("MEDIUM",   score);
        if (score <= 89)  return ("HIGH RISK", score);
        return ("CRITICAL", score);
    }

    function totalScannedCount() external view returns (uint256) {
        return totalScanned;
    }
}
