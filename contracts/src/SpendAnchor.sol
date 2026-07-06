// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title SpendAnchor — tamper-evident audit anchors for Subscription Autopilot
/// @notice SpendGuard writes (1) a hash of every policy version and (2) per-epoch
///         spend commitments. Anyone can verify the dashboard's story against Arc.
contract SpendAnchor {
    address public immutable owner;

    event PolicyAnchored(bytes32 indexed policyHash, uint256 timestamp);
    event EpochCommitted(uint256 indexed epoch, bytes32 spendRoot, uint256 totalSpentAtomic, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorPolicy(bytes32 policyHash) external onlyOwner {
        emit PolicyAnchored(policyHash, block.timestamp);
    }

    function commitEpoch(uint256 epoch, bytes32 spendRoot, uint256 totalSpentAtomic) external onlyOwner {
        emit EpochCommitted(epoch, spendRoot, totalSpentAtomic, block.timestamp);
    }
}
