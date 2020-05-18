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

  // Events //

  /**
   * @dev Emitted on construction and when Governance upgrades the Exchange contract address
   */
  event ExchangeChanged(address oldExchange, address newExchange);
  /**
   * @dev Emitted on construction and when Governance replaces itself by upgrading the Governance contract address
   */
  event GovernanceChanged(address oldGovernance, address newGovernance);
  /**
   * @dev Emitted when the Exchange withdraws ETH or token
   */
  event Withdrawn(
    address indexed wallet,
    address indexed asset,
    uint256 tokenQuantity,
    address exchange
  );

  address _exchange;
  address _governance;

  /**
   * @dev Sets `owner` and `admin` to `msg.sender`. Sets initial values for Exchange and Governance
   * contract addresses, after which they can only be changed by the currently set Governance contract
   * itself
   */
  constructor(address exchange, address governance) public Owned() {
    require(exchange != address(0x0), 'Invalid exchange contract address');
    require(governance != address(0x0), 'Invalid governance contract address');

    _exchange = exchange;
    _governance = governance;

    emit ExchangeChanged(address(0x0), exchange);
    emit GovernanceChanged(address(0x0), governance);
  }

  /**
   * @dev ETH can only be sent by the Exchange
   */
  receive() external override payable onlyExchange {}

  /**
   * Withdraw any asset and amount to a target wallet. No balance checking performed
   */
  function withdraw(
    address payable wallet,
    address asset,
    uint256 tokenQuantity
  ) external override onlyExchange {
    Transfers.transferTo(wallet, asset, tokenQuantity);
    emit Withdrawn(wallet, asset, tokenQuantity, _exchange);
  }

  /**
   * @dev Returns address of current Exchange contract
   */
  function getExchange() external override returns (address) {
    return _exchange;
  }

  /**
   * @dev Sets a new Exchange contract address
   */
  function setExchange(address newExchange) external override onlyGovernance {
    require(newExchange != address(0x0), 'Invalid contract address');

    address oldExchange = _exchange;
    _exchange = newExchange;

    emit ExchangeChanged(oldExchange, newExchange);
  }

  /**
   * @dev Returns address of current Governance contract
   */
  function getGovernance() external override returns (address) {
    return _governance;
  }

  /**
   * @dev Sets a new Governance contract address
   */
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

  // RBAC //

  modifier onlyExchange() {
    require(msg.sender == _exchange, 'Caller must be Exchange contract');
    _;
  }

  modifier onlyGovernance() {
    require(msg.sender == _governance, 'Caller must be Governance contract');
    _;
  }
}
