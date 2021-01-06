// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.7.6;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';


contract TestToken is ERC20 {
  uint256 public INITIAL_SUPPLY = 10**32;

  constructor() ERC20('TestToken', 'TKN') {
    _mint(msg.sender, INITIAL_SUPPLY);
  }
}
