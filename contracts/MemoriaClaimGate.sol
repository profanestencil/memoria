// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MemoriaClaimGate
 * @notice Optional onchain leg for “onchain” claim campaigns: records a redemption digest to prevent naive double-spend.
 * @dev Pair with server-issued `coupon` (HMAC of redemption id). The app/backend should verify HMAC offchain before
 *      calling `markRedeemed`, or extend this contract with EIP-712 / Merkle verification for trust-minimized flows.
 */
contract MemoriaClaimGate {
    address public owner;

    mapping(bytes32 => bool) public redeemed;

    event RedemptionMarked(bytes32 indexed digest, address indexed caller);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error AlreadyRedeemed();
    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address next) external onlyOwner {
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    /// @notice Backend-approved step: mark a coupon digest as used onchain (anti-replay anchor).
    function markRedeemed(bytes32 couponDigest) external onlyOwner {
        if (redeemed[couponDigest]) revert AlreadyRedeemed();
        redeemed[couponDigest] = true;
        emit RedemptionMarked(couponDigest, msg.sender);
    }
}
