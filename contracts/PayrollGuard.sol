// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title PayrollGuard
/// @notice Owner-custody treasury for Keel Payroll.
///         The agent may call only allowlisted contracts, only until expiry,
///         and only up to a daily USD₮ notional. USD₮ `approve` and `transfer`
///         amounts are metered on chain. Local-stablecoin transfers must name
///         an allowlisted payee. The owner revokes the agent in one transaction.
/// @dev Textile FX quotes bind the taker. This contract is the taker: it holds
///      the sell token and implements ERC-1271 with a plain 65-byte ECDSA
///      signature from the agent. That is the signature shape Textile recovers
///      for an EOA and the shape its `isValidSignature` read expects. It is
///      not Altana's nested session envelope.
contract PayrollGuard {
    address public owner;
    address public agent;
    address public quoteToken;
    uint64 public expiry;
    bool public revoked;
    uint256 public dailyCap;
    uint256 public windowStart;
    uint256 public spentInWindow;

    mapping(address => bool) public allowedTarget;
    mapping(address => bool) public allowedPayee;

    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    bytes4 internal constant TRANSFER = 0xa9059cbb;
    bytes4 internal constant TRANSFER_FROM = 0x23b872dd;
    bytes4 internal constant APPROVE = 0x095ea7b3;

    event AgentSet(address indexed agent);
    event Revoked(address indexed by);
    event TargetSet(address indexed target, bool allowed);
    event PayeeSet(address indexed payee, bool allowed);
    event CapSet(uint256 dailyCap);
    event ExpirySet(uint64 expiry);
    event Executed(address indexed target, bytes4 selector, uint256 metered);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    error NotOwner();
    error NotAgent();
    error RevokedOrExpired();
    error TargetNotAllowed();
    error PayeeNotAllowed();
    error CapExceeded();
    error CallFailed(bytes reason);
    error ZeroAddress();
    error BadCalldata();
    error BadSignature();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address owner_,
        address agent_,
        address quoteToken_,
        uint256 dailyCap_,
        uint64 expiry_
    ) {
        if (owner_ == address(0) || agent_ == address(0) || quoteToken_ == address(0)) {
            revert ZeroAddress();
        }
        owner = owner_;
        agent = agent_;
        quoteToken = quoteToken_;
        dailyCap = dailyCap_;
        expiry = expiry_;
    }

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentSet(agent_);
    }

    function setExpiry(uint64 expiry_) external onlyOwner {
        expiry = expiry_;
        emit ExpirySet(expiry_);
    }

    function setDailyCap(uint256 dailyCap_) external onlyOwner {
        dailyCap = dailyCap_;
        emit CapSet(dailyCap_);
    }

    function setTarget(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedTarget[target] = allowed;
        emit TargetSet(target, allowed);
    }

    function setPayee(address payee, bool allowed) external onlyOwner {
        if (payee == address(0)) revert ZeroAddress();
        allowedPayee[payee] = allowed;
        emit PayeeSet(payee, allowed);
    }

    /// @notice One transaction. The agent cannot undo it, and the next
    ///         `execute` reverts. The owner can still rescue balances.
    function revoke() external onlyOwner {
        revoked = true;
        emit Revoked(msg.sender);
    }

    function status()
        external
        view
        returns (bool isRevoked, uint64 expiry_, uint256 dailyCap_, uint256 spentToday, address agent_)
    {
        uint256 spent = _currentSpent();
        return (revoked, expiry, dailyCap, spent, agent);
    }

    /// @notice Forwards `data` to an allowlisted target. Trailing bytes
    ///         (an ERC-8021 suffix on the *outer* transaction) are not part
    ///         of `data` and are ignored by Solidity's ABI decoder.
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        _requireAgentLive();
        if (!allowedTarget[target]) revert TargetNotAllowed();
        if (data.length < 4) revert BadCalldata();

        bytes4 selector = bytes4(data[:4]);
        uint256 metered = _enforcePolicy(target, selector, data);

        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert CallFailed(ret);
        emit Executed(target, selector, metered);
        return ret;
    }

    /// @notice Owner recovery. Not subject to the agent cap.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(TRANSFER, to, amount));
        if (!ok || (ret.length >= 32 && !abi.decode(ret, (bool)))) revert CallFailed(ret);
        emit Rescued(token, to, amount);
    }

    /// @notice ERC-1271. `hash` is the digest Textile already computed.
    ///         A 65-byte ECDSA signature from the current agent returns the
    ///         magic value. Session-key envelopes and revoked agents do not.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (revoked || block.timestamp >= expiry) return 0xffffffff;
        if (signature.length != 65) return 0xffffffff;
        address recovered = _recover(hash, signature);
        if (recovered != agent) return 0xffffffff;
        return ERC1271_MAGIC;
    }

    function _requireAgentLive() internal view {
        if (msg.sender != agent) revert NotAgent();
        if (revoked || block.timestamp >= expiry) revert RevokedOrExpired();
    }

    function _enforcePolicy(address target, bytes4 selector, bytes calldata data) internal returns (uint256 metered) {
        if (selector == TRANSFER) {
            if (data.length < 68) revert BadCalldata();
            address to = _addressWord(data, 0);
            if (!allowedPayee[to]) revert PayeeNotAllowed();
            if (target == quoteToken) metered = _accrue(_uintWord(data, 1));
        } else if (selector == TRANSFER_FROM) {
            if (data.length < 100) revert BadCalldata();
            address to = _addressWord(data, 1);
            if (!allowedPayee[to]) revert PayeeNotAllowed();
            if (target == quoteToken) metered = _accrue(_uintWord(data, 2));
        } else if (selector == APPROVE) {
            if (data.length < 68) revert BadCalldata();
            address spender = _addressWord(data, 0);
            if (!allowedTarget[spender]) revert TargetNotAllowed();
            uint256 amount = _uintWord(data, 1);
            if (target == quoteToken && amount > 0) metered = _accrue(amount);
        }
    }

    function _currentSpent() internal view returns (uint256) {
        uint256 day = block.timestamp / 1 days;
        if (day != windowStart) return 0;
        return spentInWindow;
    }

    function _accrue(uint256 amount) internal returns (uint256) {
        uint256 day = block.timestamp / 1 days;
        if (day != windowStart) {
            windowStart = day;
            spentInWindow = 0;
        }
        uint256 next = spentInWindow + amount;
        if (next > dailyCap) revert CapExceeded();
        spentInWindow = next;
        return amount;
    }

    function _addressWord(bytes calldata data, uint256 word) internal pure returns (address) {
        uint256 start = 4 + word * 32;
        return address(bytes20(data[start + 12:start + 32]));
    }

    function _uintWord(bytes calldata data, uint256 word) internal pure returns (uint256) {
        uint256 start = 4 + word * 32;
        return uint256(bytes32(data[start:start + 32]));
    }

    function _recover(bytes32 hash, bytes calldata signature) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadSignature();
        // Reject malleable s (upper half of the curve order).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert BadSignature();
        }
        address recovered = ecrecover(hash, v, r, s);
        if (recovered == address(0)) revert BadSignature();
        return recovered;
    }

    receive() external payable {}
}
