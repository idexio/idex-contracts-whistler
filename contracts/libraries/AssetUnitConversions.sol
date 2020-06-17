// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';


library AssetUnitConversions {
  using SafeMath256 for uint256;

  function pipsToAssetUnits(uint64 quantityInPips, uint8 assetDecimals)
    internal
    pure
    returns (uint256)
  {
    // Exponents cannot be negative, so divide or multiply based on exponent signedness
    if (assetDecimals > 8) {
      return uint256(quantityInPips) * uint256(10)**(assetDecimals - 8);
    }
    return uint256(quantityInPips) / uint256(10)**(8 - assetDecimals);
  }

  function assetUnitsToPips(uint256 quantityInAssetUnits, uint8 assetDecimals)
    internal
    pure
    returns (uint64)
  {
    uint256 quantityInPips;
    // Exponents cannot be negative, so divide or multiply based on exponent signedness
    if (assetDecimals > 8) {
      quantityInPips = quantityInAssetUnits / uint256(10)**(assetDecimals - 8);
    } else {
      quantityInPips = quantityInAssetUnits * uint256(10)**(8 - assetDecimals);
    }
    require(quantityInPips < 2**64, 'Pip quantity overflows uint64');

    return uint64(quantityInPips);
  }
}
