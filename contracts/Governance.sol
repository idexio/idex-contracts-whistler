// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { ICustodian } from './libraries/Interfaces.sol';
import { Owned } from './Owned.sol';


contract Governance is Owned {
  /**
   * @dev Emitted when admin initiates upgrade of `Exchange` contract address on `Custodian` via
   * `initiateExchangeUpgrade`
   */
  event ExchangeUpgradeInitiated(
    address oldExchange,
    address newExchange,
    uint256 blockThreshold
  );
  /**
   * @dev Emitted when admin cancels previously started `Exchange` upgrade with `cancelExchangeUpgrade`
   */
  event ExchangeUpgradeCanceled(address oldExchange, address newExchange);
  /**
   * @dev Emitted when admin finalizes `Exchange` upgrade via `finalizeExchangeUpgrade`
   */
  event ExchangeUpgradeFinalized(address oldExchange, address newExchange);
  /**
   * @dev Emitted when admin initiates upgrade of `Governance` contract address on `Custodian` via
   * `initiateGovernanceUpgrade`
   */
  event GovernanceUpgradeInitiated(
    address oldGovernance,
    address newGovernance,
    uint256 blockThreshold
  );
  /**
   * @dev Emitted when admin cancels previously started `Governance` upgrade with `cancelGovernanceUpgrade`
   */
  event GovernanceUpgradeCanceled(address oldGovernance, address newGovernance);
  /**
   * @dev Emitted when admin finalizes `Governance` upgrade via `finalizeGovernanceUpgrade`, effectively replacing
   * this contract and rendering it non-functioning
   */
  event GovernanceUpgradeFinalized(
    address oldGovernance,
    address newGovernance
  );

  // Internally used structs //

  struct ContractUpgrade {
    bool exists;
    address newContract;
    uint256 blockThreshold;
  }

  // Storage //

  uint256 immutable _blockDelay;
  ICustodian _custodian;
  ContractUpgrade _currentExchangeUpgrade;
  ContractUpgrade _currentGovernanceUpgrade;

  /**
   * @dev Sets `owner` and `admin` to `msg.sender`. Sets the values for `_blockDelay` governing Exchange
   * and Governance upgrades. This value is immutable, and cannot be changed after construction
   */
  constructor(uint256 blockDelay) public Owned() {
    _blockDelay = blockDelay;
  }

  /**
   * @dev Sets the address of the `Custodian` contract. This value is immutable once set and cannot be changed again
   *
   * @param newCustodian The address of the `Custodian` contract deployed against this `Governance` contract's address
   */
  function setCustodian(ICustodian newCustodian) external onlyAdmin {
    require(_custodian == ICustodian(0x0), 'Custodian can only be set once');
    require(newCustodian != ICustodian(0x0), 'Invalid address');

    _custodian = newCustodian;
  }

  // Exchange upgrade //

  /**
   * @dev Initiates `Exchange` contract upgrade proccess on `Custodian`. Once `blockDelay` has passed
   * the process can be finalized with `finalizeExchangeUpgrade`
   */
  function initiateExchangeUpgrade(address newExchange) external onlyAdmin {
    require(newExchange != address(0x0), 'Invalid address');
    require(
      !_currentExchangeUpgrade.exists,
      'Exchange upgrade already in progress'
    );

    _currentExchangeUpgrade = ContractUpgrade(
      true,
      newExchange,
      block.number + _blockDelay
    );

    emit ExchangeUpgradeInitiated(
      _custodian.getExchange(),
      newExchange,
      _currentExchangeUpgrade.blockThreshold
    );
  }

  /**
   * @dev Cancels an in-flight `Exchange` contract upgrade that has not yet been finalized
   */
  function cancelExchangeUpgrade() external onlyAdmin {
    require(_currentExchangeUpgrade.exists, 'No Exchange upgrade in progress');

    address newExchange = _currentExchangeUpgrade.newContract;
    delete _currentExchangeUpgrade;

    emit ExchangeUpgradeCanceled(_custodian.getExchange(), newExchange);
  }

  /**
   * @dev Finalizes the `Exchange` contract upgrade by changing the contract address on the `Custodian`
   * contract. The number of blocks specified by `blockDelay` must have passed since calling
   * `initiateExchangeUpgrade`
   */
  function finalizeExchangeUpgrade(address newExchange) external onlyAdmin {
    require(_currentExchangeUpgrade.exists, 'No Exchange upgrade in progress');
    require(
      _currentExchangeUpgrade.newContract == newExchange,
      'Address mismatch'
    );
    require(
      block.number >= _currentExchangeUpgrade.blockThreshold,
      'Block threshold not yet reached'
    );

    address oldExchange = _custodian.getExchange();
    _custodian.setExchange(newExchange);
    delete _currentExchangeUpgrade;

    emit ExchangeUpgradeFinalized(oldExchange, newExchange);
  }

  // Governance upgrade //

  /**
   * @dev Initiates `Governance` contract upgrade proccess on `Custodian`. Once `blockDelay` has passed
   * the process can be finalized with `finalizeGovernanceUpgrade`
   */
  function initiateGovernanceUpgrade(address newGovernance) external onlyAdmin {
    require(newGovernance != address(0x0), 'Invalid address');
    require(
      !_currentGovernanceUpgrade.exists,
      'Governance upgrade already in progress'
    );

    _currentGovernanceUpgrade = ContractUpgrade(
      true,
      newGovernance,
      block.number + _blockDelay
    );

    emit GovernanceUpgradeInitiated(
      _custodian.getGovernance(),
      newGovernance,
      _currentGovernanceUpgrade.blockThreshold
    );
  }

  /**
   * @dev Cancels an in-flight `Governance` contract upgrade that has not yet been finalized
   */
  function cancelGovernanceUpgrade() external onlyAdmin {
    require(
      _currentGovernanceUpgrade.exists,
      'No Governance upgrade in progress'
    );

    address newGovernance = _currentGovernanceUpgrade.newContract;
    delete _currentGovernanceUpgrade;

    emit GovernanceUpgradeCanceled(_custodian.getGovernance(), newGovernance);
  }

  /**
   * @dev Finalizes the `Governance` contract upgrade by changing the contract address on the `Custodian`
   * contract. The number of blocks specified by `blockDelay` must have passed since calling
   * `initiateExchangeUpgrade`. Note that after calling this function, the current contract will
   * become useless since it is no longer whitelisted in the `Custodian`, and a new `Custodian` cannot
   * be set
   */
  function finalizeGovernanceUpgrade(address newGovernance) external onlyAdmin {
    require(
      _currentGovernanceUpgrade.exists,
      'No Governance upgrade in progress'
    );
    require(
      _currentGovernanceUpgrade.newContract == newGovernance,
      'Address mismatch'
    );
    require(
      block.number >= _currentGovernanceUpgrade.blockThreshold,
      'Block threshold not yet reached'
    );

    address oldGovernance = _custodian.getGovernance();
    _custodian.setGovernance(newGovernance);
    delete _currentGovernanceUpgrade;

    emit GovernanceUpgradeFinalized(oldGovernance, newGovernance);
  }
}
