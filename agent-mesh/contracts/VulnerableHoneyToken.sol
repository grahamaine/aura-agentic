// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VulnerableHoneyToken
 * @notice *** DEMO CONTRACT — DO NOT USE WITH REAL FUNDS ***
 *
 * This contract intentionally contains classic rug-pull and exploit patterns
 * used in live AuraGuard demonstrations.  AuraGuard agents should detect:
 *
 *   [CRITICAL] Unlimited owner mint with no cap
 *   [CRITICAL] Configurable transfer tax (can be raised to 99%)
 *   [HIGH]     Sell blacklist — owner can block any address from selling
 *   [HIGH]     LP removal backdoor — owner can drain liquidity instantly
 *   [MEDIUM]   Renounce ownership disabled — owner control is permanent
 *   [LOW]      No token supply cap enforcement
 *
 * This is what AuraGuard is built to stop.
 */
contract VulnerableHoneyToken {

    string  public name     = "HoneyToken";
    string  public symbol   = "HONEY";
    uint8   public decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;

    // 🚩 TAX: owner can set this to anything 0-100 (including 99%)
    uint256 public sellTaxPercent = 5;

    // 🚩 BLACKLIST: owner can trap any wallet (preventing sells)
    mapping(address => bool) public blacklisted;

    // 🚩 LP BACKDOOR: set by owner — can remove liquidity at will
    address public liquidityPool;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event TaxChanged(uint256 oldTax, uint256 newTax);
    event AddressBlacklisted(address indexed target, bool status);
    event LiquidityDrained(address indexed pool, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 initialSupply) {
        owner = msg.sender;
        _mint(msg.sender, initialSupply * 10 ** decimals);
    }

    // ── 🚩 VULN 1: Unlimited Mint ─────────────────────────────────────────────
    // Owner can mint any amount to any address — no cap, no timelock
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // ── 🚩 VULN 2: Configurable Sell Tax ─────────────────────────────────────
    // Tax can be raised to 99% AFTER users have bought in
    function setSellTax(uint256 taxPercent) external onlyOwner {
        require(taxPercent <= 99, "Max 99%");
        emit TaxChanged(sellTaxPercent, taxPercent);
        sellTaxPercent = taxPercent;
    }

    // ── 🚩 VULN 3: Sell Blacklist ─────────────────────────────────────────────
    // Owner can prevent any address from selling (honeypot trap)
    function setBlacklist(address target, bool status) external onlyOwner {
        blacklisted[target] = status;
        emit AddressBlacklisted(target, status);
    }

    // ── 🚩 VULN 4: LP Drain Backdoor ──────────────────────────────────────────
    // Owner can drain the entire liquidity pool instantly
    function setLiquidityPool(address pool) external onlyOwner {
        liquidityPool = pool;
    }

    function drainLiquidity() external onlyOwner {
        require(liquidityPool != address(0), "No pool set");
        uint256 lpBal = balanceOf[liquidityPool];
        require(lpBal > 0, "Pool empty");
        balanceOf[liquidityPool] = 0;
        balanceOf[owner] += lpBal;
        emit Transfer(liquidityPool, owner, lpBal);
        emit LiquidityDrained(liquidityPool, lpBal);
    }

    // ── Standard ERC-20 (with hidden tax on transfers) ────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!blacklisted[msg.sender], "Blacklisted: cannot sell");
        uint256 tax = (amount * sellTaxPercent) / 100;
        uint256 netAmount = amount - tax;
        _transfer(msg.sender, to, netAmount);
        if (tax > 0) _transfer(msg.sender, owner, tax); // tax goes to owner
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(!blacklisted[from], "Blacklisted: cannot sell");
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        allowance[from][msg.sender] -= amount;
        uint256 tax = (amount * sellTaxPercent) / 100;
        uint256 netAmount = amount - tax;
        _transfer(from, to, netAmount);
        if (tax > 0) _transfer(from, owner, tax);
        return true;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }
}
