// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { Structs } from './Interfaces.sol';


library AssetRegistry {
  struct Storage {
    mapping(address => Structs.Asset) assetsByAddress;
    // Mapping value is array since the same symbol can be re-used for a different address
    // (usually as a result of a token swap or upgrade)
    mapping(string => Structs.Asset[]) assetsBySymbol;
  }

  // Registration //

  function registerToken(
    Storage storage self,
    address tokenAddress,
    string memory symbol,
    uint8 decimals
  ) internal {
    require(
      !self.assetsByAddress[tokenAddress].isConfirmed,
      'Registration of this asset is already finalized'
    );
    require(decimals <= 18, 'Decimals cannot exceed 18');
    self.assetsByAddress[tokenAddress] = Structs.Asset({
      exists: true,
      assetAddress: tokenAddress,
      symbol: symbol,
      decimals: decimals,
      isConfirmed: false,
      confirmedAt: 0
    });
  }

  function confirmTokenRegistration(
    Storage storage self,
    address tokenAddress,
    string memory symbol,
    uint8 decimals
  ) internal {
    Structs.Asset memory asset = self.assetsByAddress[tokenAddress];
    require(asset.exists, 'Unknown asset');
    require(
      !asset.isConfirmed,
      'Registration of this asset is already finalized'
    );
    require(isStringEqual(asset.symbol, symbol), 'Symbols do not match');
    require(asset.decimals == decimals, 'Decimals do not match');

    asset.isConfirmed = true;
    asset.confirmedAt = uint64(block.timestamp * 1000); // Block timestamp is seconds, store ms
    self.assetsByAddress[tokenAddress] = asset;
    self.assetsBySymbol[symbol].push(asset);
  }

  /**
   * @dev Resolves a asset symbol into corresponding Asset struct
   *
   * @param assetAddress Ethereum address of asset
   */
  function loadAssetByAddress(Storage storage self, address assetAddress)
    internal
    view
    returns (Structs.Asset memory)
  {
    if (assetAddress == address(0x0)) {
      return getEthAsset();
    }

    Structs.Asset memory asset = self.assetsByAddress[assetAddress];
    require(
      asset.exists && asset.isConfirmed,
      'No confirmed asset found for address'
    );

    return asset;
  }

  /**
   * @dev Resolves a asset symbol into corresponding Asset struct
   *
   * @param symbol Asset symbol, e.g. 'IDEX'
   * @param timestamp Milliseconds since Unix epoch, usually parsed from a UUID v1 order nonce.
   * Constrains symbol resolution to the asset most recently confirmed prior to timestamp. Reverts
   * if no such asset exists
   */
  function loadAssetBySymbol(
    Storage storage self,
    string memory symbol,
    uint64 timestamp
  ) internal view returns (Structs.Asset memory) {
    if (isStringEqual('ETH', symbol)) {
      return getEthAsset();
    }

    Structs.Asset memory asset;
    if (self.assetsBySymbol[symbol].length > 0) {
      for (uint8 i = 0; i < self.assetsBySymbol[symbol].length; i++) {
        if (self.assetsBySymbol[symbol][i].confirmedAt <= timestamp) {
          asset = self.assetsBySymbol[symbol][i];
        }
      }
    }
    require(
      asset.exists && asset.isConfirmed,
      'No confirmed asset found for symbol'
    );

    return asset;
  }

  /**
   * @dev ETH is modeled as an always-confirmed Asset struct for programmatic consistency
   */
  function getEthAsset() private pure returns (Structs.Asset memory) {
    return Structs.Asset(true, address(0x0), 'ETH', 18, true, 0);
  }

  // See https://solidity.readthedocs.io/en/latest/types.html#bytes-and-strings-as-arrays
  function isStringEqual(string memory a, string memory b)
    private
    pure
    returns (bool)
  {
    return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
  }
}
