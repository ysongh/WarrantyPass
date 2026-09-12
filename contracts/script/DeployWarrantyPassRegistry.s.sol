// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {WarrantyPassRegistry} from "../src/WarrantyPassRegistry.sol";

/// @notice Deploys the registry. Arc Testnet in practice, but chain-agnostic.
///
/// @dev Secrets
/// -----------
/// The deployer key is read from the `DEPLOYER_PRIVATE_KEY` environment
/// variable and never appears in this file, in `.env.example`, or in any
/// committed artifact. It must never be given a `VITE_` prefix: that would
/// compile a funded key into a public JavaScript bundle.
///
/// A local keystore is the better habit if you have one set up — drop the env
/// var and run with `--account <name>`, which prompts for a password instead of
/// leaving a plaintext key on disk.
///
/// @dev Usage
/// ----------
///   forge script contracts/script/DeployWarrantyPassRegistry.s.sol \
///     --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vvvv
///
/// Drop `--broadcast` for a simulation that spends nothing.
///
/// @dev Gas is paid in USDC
/// -----------------------
/// Arc is Circle's chain and USDC is its native token, so the deployer needs
/// testnet USDC — not ETH — from https://faucet.circle.com. A wallet funded
/// with ETH cannot deploy here. `deployer.balance` below is that USDC balance,
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
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("chain id  ", block.chainid);
        console.log("deployer  ", deployer);
        console.log("balance   ", deployer.balance);

        vm.startBroadcast(deployerKey);
        registry = new WarrantyPassRegistry();
        vm.stopBroadcast();

        console.log("registry  ", address(registry));
        console.log("");
        console.log("Record the address, transaction hash and block number, then set");
        console.log("VITE_WARRANTY_PASS_REGISTRY_ADDRESS to the address above.");
    }
}
