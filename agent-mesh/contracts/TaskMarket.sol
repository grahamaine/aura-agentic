// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAgentMesh.sol";
import "./AgentRegistry.sol";
import "./AgentVault.sol";

/**
 * @title TaskMarket
 * @notice The core coordination contract for AgentMesh.
 *
 * Lifecycle:
 *   postTask() → submitBid() → assignTask() → submitResult()
 *               → verifyAndPay() → [reputation update]
 *
 * Somnia-native design:
 *   - Reactive events: off-chain agents subscribe to TaskPosted and wake up instantly
 *     instead of polling. Somnia's sub-second finality means agents receive the event
 *     and can submit a bid within the same second.
 *   - Orchestrator sub-tasks: an orchestrator agent can call postTask() for each
 *     sub-task, creating a fully on-chain agent hierarchy.
 *   - Quality gating: only tasks with qualityScore >= minQuality release payment.
 */
contract TaskMarket is ITaskMarket, Ownable, ReentrancyGuard {
    AgentRegistry public registry;
    AgentVault public vault;

    uint256 public taskCount;
    uint256 public constant MIN_REWARD = 0.0001 ether;
    uint256 public constant MIN_QUALITY = 60; // tasks below 60/100 trigger dispute

    mapping(uint256 => Task) private _tasks;
    uint256[] private _openTaskIds;

    // parentTask => subTaskIds (for orchestrator decomposition)
    mapping(uint256 => uint256[]) public subTasks;

    // Designated verifier agent address (set by owner, can be rotated)
    address public verifierAgent;

    modifier onlyVerifier() {
        require(msg.sender == verifierAgent || msg.sender == owner(), "Not verifier");
        _;
    }

    modifier taskExists(uint256 taskId) {
        require(_tasks[taskId].poster != address(0), "Task not found");
        _;
    }

    event SubTaskCreated(uint256 indexed parentId, uint256 indexed subTaskId);
    event VerifierSet(address indexed verifier);

    constructor(address registryAddr, address vaultAddr) Ownable(msg.sender) {
        registry = AgentRegistry(registryAddr);
        vault = AgentVault(vaultAddr);
    }

    function setVerifier(address v) external onlyOwner {
        verifierAgent = v;
        emit VerifierSet(v);
    }

    // ─── Core Task Flow ─────────────────────────────────────────────────────────

    function postTask(
        string calldata title,
        string calldata description,
        string calldata inputData,
        IAgentRegistry.Capability requiredCapability,
        uint256 deadline,
        Priority priority
    ) external payable nonReentrant returns (uint256 taskId) {
        require(msg.value >= MIN_REWARD, "Reward too low");
        require(deadline > block.timestamp, "Bad deadline");

        taskId = ++taskCount;
        Task storage t = _tasks[taskId];
        t.id = taskId;
        t.poster = msg.sender;
        t.title = title;
        t.description = description;
        t.inputData = inputData;
        t.requiredCapability = requiredCapability;
        t.reward = msg.value;
        t.deadline = deadline;
        t.status = TaskStatus.Open;
        t.priority = priority;
        t.createdAt = block.timestamp;

        _openTaskIds.push(taskId);

        // Escrow funds immediately
        vault.escrowFunds{value: msg.value}(taskId);

        emit TaskPosted(taskId, msg.sender, msg.value);
    }

    /**
     * @notice Orchestrator agent can decompose a parent task into sub-tasks.
     *         Each sub-task is a full task with its own reward slice.
     */
    function postSubTask(
        uint256 parentId,
        string calldata title,
        string calldata description,
        string calldata inputData,
        IAgentRegistry.Capability requiredCapability,
        uint256 deadline
    ) external payable taskExists(parentId) nonReentrant returns (uint256 subTaskId) {
        require(
            _tasks[parentId].assignedAgent == msg.sender,
            "Only assigned orchestrator"
        );
        subTaskId = this.postTask{value: msg.value}(
            title, description, inputData, requiredCapability, deadline, Priority.High
        );
        subTasks[parentId].push(subTaskId);
        emit SubTaskCreated(parentId, subTaskId);
    }

    function submitBid(uint256 taskId) external taskExists(taskId) {
        Task storage t = _tasks[taskId];
        require(t.status == TaskStatus.Open, "Not open");
        require(block.timestamp < t.deadline, "Expired");
        require(registry.isActive(msg.sender), "Agent not active");

        // Verify agent has the required capability
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(msg.sender);
        bool hasCapability;
        for (uint i = 0; i < profile.capabilities.length; i++) {
            if (profile.capabilities[i] == t.requiredCapability) {
                hasCapability = true;
                break;
            }
        }
        require(hasCapability, "Missing capability");

        // Dedup
        for (uint i = 0; i < t.bidders.length; i++) {
            require(t.bidders[i] != msg.sender, "Already bid");
        }
        t.bidders.push(msg.sender);
        emit BidSubmitted(taskId, msg.sender);
    }

    /**
     * @notice Task poster (or orchestrator) picks the winning agent.
     *         Selection strategy is handled off-chain (reputation-weighted).
     */
    function assignTask(uint256 taskId, address agent) external taskExists(taskId) {
        Task storage t = _tasks[taskId];
        require(msg.sender == t.poster || msg.sender == owner(), "Not poster");
        require(t.status == TaskStatus.Open, "Not open");
        require(registry.isActive(agent), "Agent not active");

        // Verify agent bid
        bool didBid;
        for (uint i = 0; i < t.bidders.length; i++) {
            if (t.bidders[i] == agent) { didBid = true; break; }
        }
        require(didBid, "Agent did not bid");

        t.assignedAgent = agent;
        t.status = TaskStatus.Assigned;

        _removeFromOpen(taskId);
        emit TaskAssigned(taskId, agent);
    }

    function submitResult(
        uint256 taskId,
        string calldata resultHash
    ) external taskExists(taskId) {
        Task storage t = _tasks[taskId];
        require(msg.sender == t.assignedAgent, "Not assigned agent");
        require(
            t.status == TaskStatus.Assigned || t.status == TaskStatus.InProgress,
            "Wrong status"
        );
        t.resultHash = resultHash;
        t.status = TaskStatus.PendingVerification;
    }

    /**
     * @notice Verifier agent calls this after scoring the result off-chain with AI.
     *         qualityScore 0-100. Below MIN_QUALITY → dispute, funds held.
     */
    function verifyAndPay(
        uint256 taskId,
        uint256 qualityScore
    ) external onlyVerifier taskExists(taskId) nonReentrant {
        require(qualityScore <= 100, "Score out of range");
        Task storage t = _tasks[taskId];
        require(t.status == TaskStatus.PendingVerification, "Not pending verification");

        t.qualityScore = qualityScore;

        if (qualityScore >= MIN_QUALITY) {
            t.status = TaskStatus.Completed;
            vault.releaseFunds(taskId, t.assignedAgent, verifierAgent);
            registry.updateReputation(t.assignedAgent, true);
            emit TaskCompleted(taskId, t.assignedAgent, qualityScore);
        } else {
            t.status = TaskStatus.Disputed;
            registry.updateReputation(t.assignedAgent, false);
            emit TaskDisputed(taskId, verifierAgent);
        }
    }

    // ─── Reads ──────────────────────────────────────────────────────────────────

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    function getOpenTasks() external view returns (uint256[] memory) {
        return _openTaskIds;
    }

    function getSubTasks(uint256 parentId) external view returns (uint256[] memory) {
        return subTasks[parentId];
    }

    function getBidders(uint256 taskId) external view returns (address[] memory) {
        return _tasks[taskId].bidders;
    }

    // ─── Internals ──────────────────────────────────────────────────────────────

    function _removeFromOpen(uint256 taskId) internal {
        uint len = _openTaskIds.length;
        for (uint i = 0; i < len; i++) {
            if (_openTaskIds[i] == taskId) {
                _openTaskIds[i] = _openTaskIds[len - 1];
                _openTaskIds.pop();
                break;
            }
        }
    }

    // Emergency: allow poster to cancel if no bids after deadline
    function cancelTask(uint256 taskId) external taskExists(taskId) nonReentrant {
        Task storage t = _tasks[taskId];
        require(msg.sender == t.poster, "Not poster");
        require(t.status == TaskStatus.Open, "Not open");
        require(block.timestamp > t.deadline, "Not expired");
        t.status = TaskStatus.Cancelled;
        _removeFromOpen(taskId);
        vault.refundFunds(taskId, t.poster);
    }
}
