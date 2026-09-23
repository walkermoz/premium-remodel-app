// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Narrow interface for TokenWorks' verified NFTStrategy factory.
/// @dev The factory deploys the strategy token, creates its Uniswap v4 pool,
///      connects the fee hook, and records the underlying NFT collection.
interface INFTStrategyFactory {
    function ownerLaunchNFTStrategy(
        address collection,
        string calldata tokenName,
        string calldata tokenSymbol,
        address collectionOwner,
        uint256 buyIncrement
    ) external payable returns (address strategy);

    function updatePriceMultiplier(address strategy, uint256 newMultiplier) external;

    function collectionToNFTStrategy(address collection) external view returns (address strategy);

    function checkIfAlreadyLaunched(address collection) external view returns (bool);
}

/// @notice Read and execution surface used by the Credits Strategy site/keeper.
interface INFTStrategy {
    function collection() external view returns (address);
    function factory() external view returns (address);
    function hookAddress() external view returns (address);
    function currentFees() external view returns (uint256);
    function ethToTwap() external view returns (uint256);
    function priceMultiplier() external view returns (uint256);
    function nftForSale(uint256 tokenId) external view returns (uint256);

    function buyTargetNFT(uint256 value, bytes calldata data, uint256 expectedId, address target) external;
    function sellTargetNFT(uint256 tokenId) external payable;
    function processTokenTwap() external;
}

