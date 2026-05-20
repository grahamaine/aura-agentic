// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAgentMesh.sol";

/**
 * @title AgentRegistry
 * @notice On-chain registry for autonomous AI agents on Somnia.
 *         Agents stake STT to register, building skin-in-the-game accountability.
 *         Reputation scores gate which tasks agents can access.
 *
 * Somnia-native features used:
 *   - Reactive events: TaskMarket listens to AgentRegistered to auto-match new agents
 *   - Sub-second finality: reputation updates settle before the next task cycle
 */
contract AgentRegistry is IAgentRegistry, Ownable, ReentrancyGuard {
    uint256 public constant MIN_STAKE = 0.001 ether; // 0.001 STT
    uint256 public constant MAX_REPUTATION = 1000;

    // wallet => profile
    mapping(address => AgentProfile) private _agents;

    // capability => list of agent wallets
    mapping(uint8 => address[]) private _capabilityIndex;

    // authorized callers that can update reputation (TaskMarket, Verifier)
    mapping(address => bool) public trustedCallers;

    uint256 public totalAgents;

    modifier onlyTrusted() {
        require(trustedCallers[msg.sender] || msg.sender == owner(), "Not trusted");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
    }

    function register(
        string calldata name,
        string calldata endpoint,
        Capability[] calldata caps
    ) external payable nonReentrant {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Invalid name");
        require(caps.length > 0 && caps.length <= 6, "Invalid capabilities");
        require(_agents[msg.sender].wallet == address(0), "Already registered");

        AgentProfile storage p = _agents[msg.sender];
        p.wallet = msg.sender;
        p.name = name;
        p.endpoint = endpoint;
        p.capabilities = caps;
        p.stake = msg.value;
        p.reputation = 500; // start at mid-range
        p.status = AgentStatus.Active;
        p.registeredAt = block.timestamp;

        for (uint i = 0; i < caps.length; i++) {
            _capabilityIndex[uint8(caps[i])].push(msg.sender);
        }

        totalAgents++;
        emit AgentRegistered(msg.sender, name, caps);
    }

    function addStake() external payable nonReentrant {
        require(_agents[msg.sender].wallet != address(0), "Not registered");
        _agents[msg.sender].stake += msg.value;
        emit AgentStakeUpdated(msg.sender, _agents[msg.sender].stake);
    }

    function updateReputation(address agent, bool success) external onlyTrusted {
        AgentProfile storage p = _agents[agent];
        require(p.wallet != address(0), "Unknown agent");

        if (success) {
            p.completedTasks++;
            // Increase reputation, capped at MAX
            p.reputation = p.reputation + 10 > MAX_REPUTATION
                ? MAX_REPUTATION
                : p.reputation + 10;
        } else {
            // Penalise: slash 5% of stake, drop reputation
            uint256 slash = p.stake / 20;
            p.stake -= slash;
            p.reputation = p.reputation > 20 ? p.reputation - 20 : 0;

            if (p.reputation < 100) {
                p.status = AgentStatus.Suspended;
            }
        }

        emit ReputationUpdated(agent, p.reputation);
    }

    function getAgent(address wallet) external view returns (AgentProfile memory) {
        return _agents[wallet];
    }

    function getAgentsByCapability(Capability cap) external view returns (address[] memory) {
        address[] memory all = _capabilityIndex[uint8(cap)];
        // Filter to only Active agents
        uint count;
        for (uint i = 0; i < all.length; i++) {
            if (_agents[all[i]].status == AgentStatus.Active) count++;
        }
        address[] memory active = new address[](count);
        uint j;
        for (uint i = 0; i < all.length; i++) {
            if (_agents[all[i]].status == AgentStatus.Active) {
                active[j++] = all[i];
            }
        }
        return active;
    }

    function isActive(address agent) external view returns (bool) {
        return _agents[agent].status == AgentStatus.Active;
    }

    // Withdraw stake when deregistering
    function deregister() external nonReentrant {
        AgentProfile storage p = _agents[msg.sender];
        require(p.wallet != address(0), "Not registered");
        uint256 refund = p.stake;
        p.stake = 0;
        p.status = AgentStatus.Inactive;
        payable(msg.sender).transfer(refund);
    }
}
