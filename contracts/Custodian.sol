// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { Address } from '@openzeppelin/contracts/utils/Address.sol';

import { ICustodian } from './libraries/Interfaces.sol';
import { Owned } from './Owned.sol';
import { AssetTransfers } from './libraries/AssetTransfers.sol';


contract Custodian is ICustodian, Owned {
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
    uint256 quantityInAssetUnits,
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
    require(Address.isContract(exchange), 'Invalid exchange contract address');
    require(
      Address.isContract(governance),
      'Invalid governance contract address'
    );

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
    uint256 quantityInAssetUnits
  ) external override onlyExchange {
    AssetTransfers.transferTo(wallet, asset, quantityInAssetUnits);
    emit Withdrawn(wallet, asset, quantityInAssetUnits, _exchange);
  }

  /**
   * @dev Returns address of current Exchange contract
   */
  function getExchange() external override view returns (address) {
    return _exchange;
  }

  /**
   * @dev Sets a new Exchange contract address
   */
  function setExchange(address newExchange) external override onlyGovernance {
    require(Address.isContract(newExchange), 'Invalid contract address');

    address oldExchange = _exchange;
    _exchange = newExchange;

    emit ExchangeChanged(oldExchange, newExchange);
  }

  /**
   * @dev Returns address of current Governance contract
   */
  function getGovernance() external override view returns (address) {
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
    require(Address.isContract(newGovernance), 'Invalid contract address');

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
