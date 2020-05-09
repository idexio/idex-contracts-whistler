pragma solidity ^0.6.5;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';


contract Token is ERC20 {
  uint256 public INITIAL_SUPPLY = 1000000000000000000000;

  constructor() public ERC20('Token', 'TKN') {
    _mint(msg.sender, INITIAL_SUPPLY);
  }
}
