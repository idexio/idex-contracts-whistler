pragma solidity ^0.6.5;
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

  address exchange;
  address governance;

  constructor(address _exchange, address _governance) public Owned() {
    require(_exchange != address(0x0), 'Invalid exchange contract address');
    require(_governance != address(0x0), 'Invalid governance contract address');
    emit ExchangeChanged(exchange, _exchange);
    emit GovernanceChanged(governance, _governance);
    exchange = _exchange;
    governance = _governance;
  }

  receive() external override payable onlyExchange {}

  function withdraw(
    address payable wallet,
    address asset,
    uint256 quantity
  ) external override onlyExchange {
    Transfers.transferTo(wallet, asset, quantity);
    emit Withdrawn(wallet, asset, quantity, exchange);
  }

  function getExchange() external override returns (address) {
    return exchange;
  }

  function setExchange(address _exchange) external override onlyGovernance {
    require(_exchange != address(0x0), 'Invalid contract address');
    emit ExchangeChanged(exchange, _exchange);
    exchange = _exchange;
  }

  function getGovernance() external override returns (address) {
    return governance;
  }

  function setGovernance(address _governance) external override onlyGovernance {
    require(_governance != address(0x0), 'Invalid contract address');
    emit GovernanceChanged(governance, _governance);
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
