pragma solidity ^0.6.5;
pragma experimental ABIEncoderV2;

import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';

import { ICustodian } from './libraries/Interfaces.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { Owned } from './Owned.sol';
import { Transfers } from './libraries/Transfers.sol';


contract Custodian is ICustodian, Owned {
  using SafeMath256 for uint256;

  address exchange;
  address governance;

  constructor(address _exchange, address _governance) public Owned() {
    exchange = _exchange;
    governance = _governance;
  }

  // FIXME Prettier changes receive to function
  // prettier-ignore
  receive() external payable onlyExchange override {}

  function withdraw(
    address payable wallet,
    address asset,
    uint256 quantity
  ) external override onlyExchange {
    require(exchange != address(0x0), 'Exchange not set');
    Transfers.transferTo(wallet, asset, quantity);
  }

  function setExchange(address _exchange) external override onlyGovernance {
    exchange = _exchange;
  }

  function setGovernance(address _governance) external override onlyGovernance {
    governance = _governance;
  }

  /*** RBAC ***/

  modifier onlyExchange() {
    require(msg.sender == exchange, 'Caller must be Exchange contract');
    _;
  }

  modifier onlyGovernance() {
    require(msg.sender == governance, 'Caller must be Governance contract');
    _;
  }
}
