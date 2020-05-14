// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';

import { ICustodian } from './libraries/Interfaces.sol';
import { Owned } from './Owned.sol';
import { Transfers } from './libraries/Transfers.sol';


contract Custodian is ICustodian, Owned {
  using SafeMath256 for uint256;

  event ExchangeChanged(address oldExchange, address newExchange);
  event GovernanceChanged(address oldGovernance, address newGovernance);
  event Withdrawn(
    address indexed wallet,
    address indexed asset,
    uint256 quantity,
    address exchange
  );

  address _exchange;
  address _governance;

  constructor(address exchange, address governance) public Owned() {
    require(exchange != address(0x0), 'Invalid exchange contract address');
    require(governance != address(0x0), 'Invalid governance contract address');
    emit ExchangeChanged(_exchange, exchange);
    emit GovernanceChanged(_governance, governance);
    _exchange = exchange;
    _governance = governance;
  }

  receive() external override payable onlyExchange {}

  function withdraw(
    address payable wallet,
    address asset,
    uint256 quantity
  ) external override onlyExchange {
    Transfers.transferTo(wallet, asset, quantity);
    emit Withdrawn(wallet, asset, quantity, _exchange);
  }

  function getExchange() external override returns (address) {
    return _exchange;
  }

  function setExchange(address newExchange) external override onlyGovernance {
    require(newExchange != address(0x0), 'Invalid contract address');

    address oldExchange = _exchange;
    _exchange = newExchange;

    emit ExchangeChanged(oldExchange, newExchange);
  }

  function getGovernance() external override returns (address) {
    return _governance;
  }

  function setGovernance(address newGovernance)
    external
    override
    onlyGovernance
  {
    require(newGovernance != address(0x0), 'Invalid contract address');

    address oldGovernance = _governance;
    _governance = newGovernance;

    emit GovernanceChanged(oldGovernance, newGovernance);
  }

  /*** RBAC ***/

  modifier onlyExchange() {
    require(msg.sender == _exchange, 'Caller must be Exchange contract');
    _;
  }

  modifier onlyGovernance() {
    require(msg.sender == _governance, 'Caller must be Governance contract');
    _;
  }
}
