// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {INFTStrategyFactory} from "../src/TokenStrategyInterfaces.sol";

interface Vm {
    function envAddress(string calldata name) external view returns (address value);
    function envUint(string calldata name) external view returns (uint256 value);
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Launches Credits Strategy through TokenWorks' deployed NFTStrategyFactory.
/// @dev The broadcaster must be authorized by the selected factory. On the
///      current factory, changing the multiplier also requires factory-owner
///      authority. This script deliberately does not deploy a replacement vault.
contract DeployCreditsStrategy {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address public constant CREDITS_COLLECTION = 0x97630aA70AB14ed9883B41dAfccBc11349723043;
    uint256 public constant DEFAULT_MULTIPLIER = 1200; // 1.2x = 20% markup

    function run() external returns (address strategy) {
        address factoryAddress = vm.envAddress("TOKENSTRATEGY_FACTORY");
        address collectionFeeRecipient = vm.envAddress("COLLECTION_FEE_RECIPIENT");
        uint256 buyIncrement = vm.envUint("BUY_INCREMENT_WEI");
        uint256 multiplier = vm.envUint("PRICE_MULTIPLIER");

        require(factoryAddress != address(0), "factory required");
        require(collectionFeeRecipient != address(0), "fee recipient required");
        require(multiplier >= 1100 && multiplier <= 10000, "multiplier out of range");

        INFTStrategyFactory factory = INFTStrategyFactory(factoryAddress);
        require(factory.collectionToNFTStrategy(CREDITS_COLLECTION) == address(0), "Credits already launched");

        vm.startBroadcast();
        strategy = factory.ownerLaunchNFTStrategy{value: 2 wei}(
            CREDITS_COLLECTION,
            "Credits Strategy",
            "CREDITSTR",
            collectionFeeRecipient,
            buyIncrement
        );
        factory.updatePriceMultiplier(strategy, multiplier);
        vm.stopBroadcast();

        require(strategy != address(0), "launch failed");
    }
}
