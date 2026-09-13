// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {WarrantyPassRegistry} from "../src/WarrantyPassRegistry.sol";

/// @notice Deploys the registry. Arc Testnet in practice, but chain-agnostic.
///
/// @dev The wallet comes from the command line, never from this file
/// ---------------------------------------------------------------
/// `vm.startBroadcast()` is called with **no argument**, so the signer is
/// whichever wallet the CLI supplies. That keeps every key-handling decision at
/// the call site and lets the same script work with an encrypted keystore, a
/// hardware wallet, or a raw key, without the script knowing which.
///
/// It also means no private key is ever read into the script's memory, and none
/// can leak into a broadcast artifact from here.
///
/// A keystore is the preferred option — it never puts a plaintext key on disk:
///
///   cast wallet import warrantypass-deployer --interactive   # once
///
/// @dev Usage
/// ----------
///   forge script contracts/script/DeployWarrantyPassRegistry.s.sol \
///     --rpc-url "$ARC_TESTNET_RPC_URL" --legacy \
///     --account warrantypass-deployer --broadcast -vvvv
///
/// Any other Foundry wallet flag works in place of `--account`:
/// `--private-key`, `--interactive`, `--ledger`, `--trezor`, `--unlocked`.
/// Passing a raw `--private-key` is acceptable for local experiments only.
///
/// Drop `--broadcast` for a simulation that spends nothing.
///
/// `--legacy` is required by the Foundry installed here (forge 0.2.0, an April
/// 2024 nightly), which fails with "Failed to get EIP-1559 fees" against Arc.
/// That is a limitation of the old toolchain, not of Arc — the RPC implements
/// EIP-1559 correctly. A current Foundry would likely not need the flag.
///
/// @dev Gas is paid in USDC
/// -----------------------
/// Arc is Circle's chain and USDC is its native token, so the deployer needs
/// testnet USDC — not ETH — from https://faucet.circle.com. A wallet funded
/// with ETH cannot deploy here. The balance logged below is that USDC balance,
/// in 18-decimal native units.
///
/// Source verification is deliberately not wired into this command. Arc's
/// explorer is ArcScan rather than Etherscan, so `--verify` with an Etherscan
/// key does not apply; see docs/deployment.md.
///
/// @dev Why there is nothing to configure
/// -------------------------------------
/// The registry has no constructor arguments, no admin, no owner and no
/// initialiser — so a deployment is fully described by its bytecode, and there
/// is no post-deploy setup step that could be forgotten or front-run. That is a
/// deliberate property of the design, not an omission here.
contract DeployWarrantyPassRegistry is Script {
    function run() external returns (WarrantyPassRegistry registry) {
        // Forge resolves `msg.sender` to the wallet named on the command line,
        // so this reports the account that is actually about to pay — not a
        // value this script chose.
        console.log("chain id  ", block.chainid);
        console.log("deployer  ", msg.sender);
        console.log("balance   ", msg.sender.balance);

        vm.startBroadcast();
        registry = new WarrantyPassRegistry();
        vm.stopBroadcast();

        console.log("registry  ", address(registry));
        console.log("");
        console.log("Record the address, transaction hash and block number, then set");
        console.log("VITE_WARRANTY_PASS_REGISTRY_ADDRESS to the address above.");
    }
}
