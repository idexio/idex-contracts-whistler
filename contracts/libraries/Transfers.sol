// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';


library Transfers {
  using SafeMath256 for uint256;

  function transferTo(
    address payable wallet,
    address asset,
    uint256 quantity
  ) internal {
    if (asset == address(0x0)) {
      require(wallet.send(quantity), 'ETH transfer failed');
    } else {
      uint256 balanceBefore = IERC20(asset).balanceOf(wallet);

      try IERC20(asset).transfer(wallet, quantity) returns (bool success) {
        require(success, 'Token transfer failed');
      } catch Error(
        string memory /*reason*/
      ) {
        revert('Token transfer failed');
      }

      uint256 balanceAfter = IERC20(asset).balanceOf(wallet);
      require(
        balanceAfter.sub(balanceBefore) == quantity,
        'Token contract returned transfer success without expected balance change'
      );
    }
  }
}
