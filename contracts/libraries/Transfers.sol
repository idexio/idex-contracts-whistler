pragma solidity ^0.6.5;
pragma experimental ABIEncoderV2;

import {IERC20} from './Interfaces.sol';
import {SafeMath256} from './SafeMath256.sol';

library Transfers {
  using SafeMath256 for uint256;

  function transferTo(address payable wallet, address asset, uint256 quantity) internal {
    if (asset == address(0x0)) {
      require(wallet.send(quantity), 'ETH transfer failed');
    } else {
      uint256 balanceBefore = IERC20(asset).balanceOf(wallet);
      require(IERC20(asset).transfer(wallet, quantity), 'Token transfer failed');
      uint256 balanceAfter = IERC20(asset).balanceOf(wallet);

      require(
        balanceAfter.sub(balanceBefore) == quantity,
        'Token contract returned transfer success without expected balance change'
      );
    }
  }
}
