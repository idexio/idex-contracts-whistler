// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { Tokens } from '../libraries/Tokens.sol';


contract TokensMock {
  function pipsToTokenQuantity(uint64 quantityInPips, uint64 tokenDecimals)
    external
    pure
    returns (uint256)
  {
    return Tokens.pipsToTokenQuantity(quantityInPips, tokenDecimals);
  }

  function tokenQuantityToPips(uint256 tokenQuantity, uint256 tokenDecimals)
    external
    pure
    returns (uint64)
  {
    return Tokens.tokenQuantityToPips(tokenQuantity, tokenDecimals);
  }
}
