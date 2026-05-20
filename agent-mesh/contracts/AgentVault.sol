// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentVault
 * @notice Escrow contract that holds STT rewards until task completion is verified.
 *         On Somnia's 1M-TPS chain, releasing micro-payments per sub-task is
 *         economically viable — something impossible on slower chains.
 *
 * Split payment: executor gets 85%, verifier gets 10%, protocol fee 5%.
 */
contract AgentVault is Ownable, ReentrancyGuard {
    uint256 public constant EXECUTOR_BPS = 8500;  // 85%
    uint256 public constant VERIFIER_BPS = 1000;  // 10%
    uint256 public constant PROTOCOL_BPS = 500;   // 5%
    uint256 public constant BPS_DENOM = 10000;

    address public protocolTreasury;
    mapping(address => bool) public trustedCallers;

    // taskId => escrowed amount
    mapping(uint256 => uint256) public escrow;

    event FundsEscrowed(uint256 indexed taskId, uint256 amount);
    event FundsReleased(uint256 indexed taskId, address executor, address verifier, uint256 executorShare, uint256 verifierShare);
    event FundsRefunded(uint256 indexed taskId, address poster, uint256 amount);

    modifier onlyTrusted() {
        require(trustedCallers[msg.sender] || msg.sender == owner(), "Not trusted");
        _;
    }

    constructor(address treasury) Ownable(msg.sender) {
        protocolTreasury = treasury;
    }

    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
    }

    function escrowFunds(uint256 taskId) external payable onlyTrusted {
        require(msg.value > 0, "No funds");
        escrow[taskId] += msg.value;
        emit FundsEscrowed(taskId, msg.value);
    }

    function releaseFunds(
        uint256 taskId,
        address executor,
        address verifier
    ) external onlyTrusted nonReentrant {
        uint256 amount = escrow[taskId];
        require(amount > 0, "Nothing escrowed");

        escrow[taskId] = 0;

        uint256 executorShare = (amount * EXECUTOR_BPS) / BPS_DENOM;
        uint256 verifierShare = (amount * VERIFIER_BPS) / BPS_DENOM;
        uint256 protocolShare = amount - executorShare - verifierShare;

        payable(executor).transfer(executorShare);
        payable(verifier).transfer(verifierShare);
        payable(protocolTreasury).transfer(protocolShare);

        emit FundsReleased(taskId, executor, verifier, executorShare, verifierShare);
    }

    function refundFunds(uint256 taskId, address poster) external onlyTrusted nonReentrant {
        uint256 amount = escrow[taskId];
        require(amount > 0, "Nothing escrowed");
        escrow[taskId] = 0;
        payable(poster).transfer(amount);
        emit FundsRefunded(taskId, poster, amount);
    }

    function getEscrow(uint256 taskId) external view returns (uint256) {
        return escrow[taskId];
    }
}
