pragma solidity ^0.6.5;
pragma experimental ABIEncoderV2;

import {ICustodian, IERC20} from './libraries/Interfaces.sol';
import {Owned} from './Owned.sol';
import {SafeMath256} from './libraries/SafeMath256.sol';
import {Transfers} from './libraries/Transfers.sol';

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

  function withdraw(address payable wallet, address asset, uint256 quantity)
    external
    onlyExchange
    override
  {
    require(exchange != address(0x0), 'Exchange not set');
    Transfers.transferTo(wallet, asset, quantity);
  }

  function setExchange(address _exchange) external onlyGovernance override {
    exchange = _exchange;
  }

  function setGovernance(address _governance) external onlyGovernance override {
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
