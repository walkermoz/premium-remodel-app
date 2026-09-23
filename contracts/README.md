# Credits Strategy contract integration

This directory integrates with TokenWorks' verified `NFTStrategyFactory` instead of introducing a separate custody vault. The generated `NFTStrategy` follows the PunkStrategy loop:

1. The Uniswap v4 strategy hook sends trading fees to the strategy contract.
2. `buyTargetNFT` executes a submitted marketplace order, verifies that exactly one Credits NFT arrived, measures the actual ETH spent, and records the relist price.
3. `sellTargetNFT` transfers the NFT for the exact recorded price.
4. `processTokenTwap` uses sale proceeds to buy and burn the strategy token.

The linked collection is the Ethereum Credits ERC-721 at `0x97630aA70AB14ed9883B41dAfccBc11349723043`.

## Why this is a deployment script, not a fork

TokenStrategy's production system includes its factory, NFT strategy implementation, Uniswap v4 hook, pool, router permissions, fee distribution, and buy-and-burn path. Re-deploying only one piece would not "use PunkStrategy's contracts" and could create a misleading or unsafe partial clone. The script calls the official factory surface directly.

The current factory restricts `ownerLaunchNFTStrategy` and `updatePriceMultiplier`. The broadcast account must therefore be authorized by TokenWorks (and factory-owner authority is required to set the multiplier). This cannot be bypassed by a wrapper contract.

## Configuration

Create a local environment file outside version control with:

```text
TOKENSTRATEGY_FACTORY=<verified current factory address>
COLLECTION_FEE_RECIPIENT=<collection royalty/fee recipient>
BUY_INCREMENT_WEI=1000000000000000000
PRICE_MULTIPLIER=1200
```

`PRICE_MULTIPLIER=1200` means `1.2x`, or a 20% markup. The verified implementation accepts values from `1100` through `10000`.

Dry-run first:

```bash
forge script script/DeployCreditsStrategy.s.sol:DeployCreditsStrategy --rpc-url "$ETH_RPC_URL"
```

Broadcast only after the current factory address, authorization, collection address, fee recipient, and simulation output have all been independently verified:

```bash
forge script script/DeployCreditsStrategy.s.sol:DeployCreditsStrategy --rpc-url "$ETH_RPC_URL" --broadcast
```

No private key, deployed address, or unverified factory address is committed here.

## Sources checked

- TokenStrategy NFT Strategies documentation: <https://docs.tokenstrategy.com/strategy-types/nft-strategies>
- Verified PunkStrategy contract: <https://etherscan.io/address/0xc50673EDb3A7b94E8CAD8a7d4E0cD68864E33eDF#code>
- Verified NFTStrategy factory generation: <https://etherscan.io/address/0x1966780F08b1699fB57E05ED2d7654E3ec64390D#code>

This is experimental, unaudited integration code. It is not a deployment recommendation.
