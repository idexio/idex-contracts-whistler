pragma solidity ^0.6.1;
pragma experimental ABIEncoderV2;

interface ICustodian {
  // FIXME Prettier changes receive to function
  // prettier-ignore
  receive() external payable;
  function withdraw(address payable wallet, address asset, uint256 quantity) external;

  function setExchange(address exchange) external;
  function setGovernance(address governance) external;
}

// ----------------------------------------------------------------------------
// ERC Token Standard #20 Interface
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md
// ----------------------------------------------------------------------------
interface IERC20 {
  function totalSupply() external view returns (uint256);
  function balanceOf(address tokenOwner) external view returns (uint256 balance);
  function allowance(address tokenOwner, address spender) external view returns (uint256 remaining);
  function transfer(address to, uint256 tokens) external returns (bool success);
  function approve(address spender, uint256 tokens) external returns (bool success);
  function transferFrom(address from, address to, uint256 tokens) external returns (bool success);

  event Transfer(address indexed from, address indexed to, uint256 tokens);
  event Approval(address indexed tokenOwner, address indexed spender, uint256 tokens);
}
