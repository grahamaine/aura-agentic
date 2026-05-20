// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    enum AgentStatus { Inactive, Active, Suspended }
    enum Capability { Research, CodeGen, Analysis, Verification, Orchestration, DataFetch }

    struct AgentProfile {
        address wallet;
        string name;
        string endpoint;         // Off-chain HTTPS endpoint for agent
        Capability[] capabilities;
        uint256 stake;
        uint256 completedTasks;
        uint256 reputation;      // 0-1000 score
        AgentStatus status;
        uint256 registeredAt;
    }

    event AgentRegistered(address indexed agent, string name, Capability[] capabilities);
    event AgentStakeUpdated(address indexed agent, uint256 newStake);
    event ReputationUpdated(address indexed agent, uint256 newScore);

    function register(string calldata name, string calldata endpoint, Capability[] calldata caps) external payable;
    function getAgent(address wallet) external view returns (AgentProfile memory);
    function getAgentsByCapability(Capability cap) external view returns (address[] memory);
    function updateReputation(address agent, bool success) external;
}

interface ITaskMarket {
    enum TaskStatus { Open, Assigned, InProgress, PendingVerification, Completed, Disputed, Cancelled }
    enum Priority { Low, Medium, High, Critical }

    struct Task {
        uint256 id;
        address poster;
        string title;
        string description;
        string inputData;        // IPFS hash or JSON payload
        IAgentRegistry.Capability requiredCapability;
        uint256 reward;          // In STT (wei)
        uint256 deadline;
        TaskStatus status;
        address assignedAgent;
        address[] bidders;
        string resultHash;       // IPFS hash of result
        uint256 qualityScore;    // 0-100 from verifier
        Priority priority;
        uint256 createdAt;
    }

    event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward);
    event BidSubmitted(uint256 indexed taskId, address indexed agent);
    event TaskAssigned(uint256 indexed taskId, address indexed agent);
    event TaskCompleted(uint256 indexed taskId, address indexed agent, uint256 qualityScore);
    event TaskDisputed(uint256 indexed taskId, address indexed disputer);

    function postTask(
        string calldata title,
        string calldata description,
        string calldata inputData,
        IAgentRegistry.Capability requiredCapability,
        uint256 deadline,
        Priority priority
    ) external payable returns (uint256 taskId);

    function submitBid(uint256 taskId) external;
    function assignTask(uint256 taskId, address agent) external;
    function submitResult(uint256 taskId, string calldata resultHash) external;
    function verifyAndPay(uint256 taskId, uint256 qualityScore) external;
    function getTask(uint256 taskId) external view returns (Task memory);
    function getOpenTasks() external view returns (uint256[] memory);
}
