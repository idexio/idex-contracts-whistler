// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.8;


abstract contract Owned {
  address immutable _owner;
  address _admin;

  modifier onlyOwner {
    require(msg.sender == _owner, 'Caller must be owner');
    _;
  }
  modifier onlyAdmin {
    require(msg.sender == _admin, 'Caller must be admin');
    _;
  }

  constructor() public {
    _owner = msg.sender;
    _admin = msg.sender;
  }

  function setAdmin(address newAdmin) external onlyOwner {
    require(newAdmin != address(0x0), 'Invalid wallet address');
    require(newAdmin != _admin, 'Must be different from current admin');

    _admin = newAdmin;
  }

  function removeAdmin() external onlyOwner {
    _admin = address(0x0);
  }
}
