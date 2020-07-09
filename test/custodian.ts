import BigNumber from 'bignumber.js';
import { ethAddress } from './helpers';
import { CustodianInstance } from '../types/truffle-v5/Custodian';
import { ExchangeInstance } from '../types/truffle-v5/Exchange';
import { ExchangeMockInstance } from '../types/truffle-v5/ExchangeMock';
import { GovernanceInstance } from '../types/truffle-v5/Governance';
import { GovernanceMockInstance } from '../types/truffle-v5/GovernanceMock';

contract('Custodian', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');
  const GovernanceMock = artifacts.require('GovernanceMock');
  const ExchangeMock = artifacts.require('ExchangeMock');
  const Token = artifacts.require('TestToken');

  let exchange: ExchangeInstance;
  let governance: GovernanceInstance;
  beforeEach(async () => {
    exchange = await Exchange.new();
    governance = await Governance.new(10);
  });

  describe('deploy', () => {
    it('should work', async () => {
      await Custodian.new(exchange.address, governance.address);
    });

    it('should revert for invalid exchange address', async () => {
      let error;
      try {
        await Custodian.new(ethAddress, governance.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid exchange contract address/i);
    });

    it('should revert for non-contract exchange address', async () => {
      let error;
      try {
        await Custodian.new(accounts[0], governance.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid exchange contract address/i);
    });

    it('should revert for invalid governance address', async () => {
      let error;
      try {
        await Custodian.new(exchange.address, ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid governance contract address/i);
    });

    it('should revert for non-contract governance address', async () => {
      let error;
      try {
        await Custodian.new(exchange.address, accounts[0]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid governance contract address/i);
    });
  });

  describe('receive', () => {
    let custodian: CustodianInstance;
    let exchangeMock: ExchangeMockInstance;
    beforeEach(async () => {
      exchangeMock = await ExchangeMock.new();
      custodian = await Custodian.new(exchangeMock.address, governance.address);
      await exchangeMock.setCustodian(custodian.address);
    });

    it('should work when sent from exchange address', async () => {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: exchangeMock.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    });

    it('should revert when not sent from exchange address', async () => {
      let error;
      try {
        await web3.eth.sendTransaction({
          from: accounts[0],
          to: custodian.address,
          value: web3.utils.toWei('1', 'ether'),
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be exchange/i);
    });
  });

  describe('setExchange', () => {
    let custodian: CustodianInstance;
    let governanceMock: GovernanceMockInstance;
    beforeEach(async () => {
      governanceMock = await GovernanceMock.new();
      custodian = await Custodian.new(exchange.address, governanceMock.address);
      governanceMock.setCustodian(custodian.address);
    });

    it('should work when sent from governance address', async () => {
      const newExchange = await Exchange.new();

      await governanceMock.setExchange(newExchange.address);

      const events = await custodian.getPastEvents('ExchangeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
    });

    it('should revert for invalid address', async () => {
      let error;
      try {
        await governanceMock.setExchange(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert for non-contract address', async () => {
      let error;
      try {
        await governanceMock.setExchange(accounts[0]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert when not sent from governance address', async () => {
      let error;
      try {
        await custodian.setExchange(ethAddress, {
          from: accounts[1],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be governance/i);
    });
  });

  describe('setGovernance', () => {
    let custodian: CustodianInstance;
    let governanceMock: GovernanceMockInstance;
    beforeEach(async () => {
      governanceMock = await GovernanceMock.new();
      custodian = await Custodian.new(exchange.address, governanceMock.address);
      governanceMock.setCustodian(custodian.address);
    });

    it('should work when sent from governance address', async () => {
      const newGovernance = await Governance.new(0);

      await governanceMock.setGovernance(newGovernance.address);

      const events = await custodian.getPastEvents('GovernanceChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
    });

    it('should revert for invalid address', async () => {
      let error;
      try {
        await governanceMock.setGovernance(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert for non-contract address', async () => {
      let error;
      try {
        await governanceMock.setGovernance(accounts[0]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert when not sent from governance address', async () => {
      let error;
      try {
        await custodian.setGovernance(ethAddress, {
          from: accounts[1],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be governance/i);
    });
  });

  describe('withdraw', () => {
    let custodian: CustodianInstance;
    let exchangeMock: ExchangeMockInstance;
    beforeEach(async () => {
      exchangeMock = await ExchangeMock.new();
      custodian = await Custodian.new(exchangeMock.address, governance.address);
      await exchangeMock.setCustodian(custodian.address);
    });

    it('should work when sent from exchange', async () => {
      const [sourceWallet, destinationWallet] = accounts;
      await web3.eth.sendTransaction({
        from: sourceWallet,
        to: exchangeMock.address,
        value: web3.utils.toWei('1', 'ether'),
      });

      const balanceBefore = await web3.eth.getBalance(destinationWallet);

      await exchangeMock.withdraw(
        destinationWallet,
        ethAddress,
        web3.utils.toWei('1', 'ether'),
      );

      const balanceAfter = await web3.eth.getBalance(destinationWallet);

      expect(
        new BigNumber(balanceAfter)
          .minus(new BigNumber(balanceBefore))
          .toString(),
      ).to.equal(web3.utils.toWei('1', 'ether'));
    });

    it('should revert withdrawing ETH not deposited', async () => {
      const [sourceWallet, destinationWallet] = accounts;

      let error;
      try {
        await exchangeMock.withdraw(
          destinationWallet,
          ethAddress,
          web3.utils.toWei('1', 'ether'),
          { from: sourceWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/ETH transfer failed/i);
    });

    it('should revert withdrawing tokens not deposited', async () => {
      const [sourceWallet, destinationWallet] = accounts;
      const token = await Token.new();

      let error;
      try {
        await exchangeMock.withdraw(
          destinationWallet,
          token.address,
          web3.utils.toWei('1', 'ether'),
          { from: sourceWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/transfer amount exceeds balance/i);
    });

    it('should revert when not sent from exchange', async () => {
      const [sourceWallet, destinationWallet] = accounts;

      let error;
      try {
        await custodian.withdraw(
          destinationWallet,
          ethAddress,
          web3.utils.toWei('1', 'ether'),
          { from: sourceWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be exchange/i);
    });
  });
});
