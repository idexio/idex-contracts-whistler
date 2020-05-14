// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';


contract SkimmingTestToken is ERC20 {
  uint256 public INITIAL_SUPPLY = 1000000000000000000000;

  bool _shouldSkim;

  constructor() public ERC20('TestToken', 'TKN') {
    _mint(msg.sender, INITIAL_SUPPLY);
  }

  function setShouldSkim(bool shouldSkim) external {
    _shouldSkim = shouldSkim;
  }

  function transfer(address recipient, uint256 amount)
    public
    virtual
    override
    returns (bool)
  {
    if (_shouldSkim) {
      _transfer(_msgSender(), recipient, amount - 1);
    } else {
      _transfer(_msgSender(), recipient, amount);
    }
    return true;
  }
}
