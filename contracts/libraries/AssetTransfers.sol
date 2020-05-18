// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';


/**
 * @dev This library provides helper utilities for transfering assets in and out of contracts with
 * a generic syntax for ETH or tokens. It further validates ERC-20 compliant balance updates in the
 * case of tokens
 */
library AssetTransfers {
  using SafeMath256 for uint256;

  /**
   * @dev Transfers assets from a wallet into a contract during deposits. If the asset is a token,
   * `wallet` must already have called `approve` on the token contract for at least `tokenQuantity`
   */
  function transferFrom(
    address wallet,
    address tokenAddress,
    uint256 tokenQuantity
  ) internal {
    uint256 balanceBefore = IERC20(tokenAddress).balanceOf(address(this));

    try
      IERC20(tokenAddress).transferFrom(wallet, address(this), tokenQuantity)
    returns (bool success) {
      require(success, 'Token transfer failed');
    } catch Error(
      string memory /*reason*/
    ) {
      revert('Token transfer failed');
    }

    uint256 balanceAfter = IERC20(tokenAddress).balanceOf(address(this));
    require(
      balanceAfter.sub(balanceBefore) == tokenQuantity,
      'Token contract returned transferFrom success without expected balance change'
    );
  }

  /**
   * @dev Transfers assets from a contract to 1) another contract, when `Exchange` forwards funds
   * to `Custodian` during deposit or 2) a wallet, when withdrawing
   */
  function transferTo(
    address payable walletOrContract,
    address asset,
    uint256 quantity
  ) internal {
    if (asset == address(0x0)) {
      require(walletOrContract.send(quantity), 'ETH transfer failed');
    } else {
      uint256 balanceBefore = IERC20(asset).balanceOf(walletOrContract);

      try IERC20(asset).transfer(walletOrContract, quantity) returns (
        bool success
      ) {
        require(success, 'Token transfer failed');
      } catch Error(
        string memory /*reason*/
      ) {
        revert('Token transfer failed');
      }

      uint256 balanceAfter = IERC20(asset).balanceOf(walletOrContract);
      require(
        balanceAfter.sub(balanceBefore) == quantity,
        'Token contract returned transfer success without expected balance change'
      );
    }
  }
}
