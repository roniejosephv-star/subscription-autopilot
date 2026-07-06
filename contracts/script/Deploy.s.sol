// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendAnchor} from "../src/SpendAnchor.sol";

/// Deploy to Arc Testnet (chain 5042002; gas paid in USDC):
///   forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC \
///     --private-key $SIGNER_FALLBACK_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        SpendAnchor anchor = new SpendAnchor();
        console.log("SpendAnchor deployed:", address(anchor));
        vm.stopBroadcast();
    }
}
