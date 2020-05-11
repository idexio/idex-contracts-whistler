pragma solidity ^0.6.5;

contract Owned {
  address immutable owner;
  address admin;

  modifier onlyOwner {
    require(msg.sender == owner, 'Caller must be owner');
    _;
  }
  modifier onlyAdmin {
    require(msg.sender == admin, 'Caller must be admin');
    _;
  }

  constructor() public {
    owner = msg.sender;
    admin = msg.sender;
  } 

  function setAdmin(address _admin) external onlyOwner {
    require(_admin != address(0x0), 'Invalid wallet address');
    require(_admin != admin, 'Must be different from current admin');
    // TODO Is below necessary?
    // require(_admin != owner, 'Admin must be different from owner');

    admin = _admin;
  }

  function removeAdmin() external onlyOwner {
    admin = address(0x0);
  }
}

