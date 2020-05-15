import { deployAndAssociateContracts } from './helpers';

contract('Governance', (accounts) => {
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

  it('should deploy', async () => {
    await Governance.new(0);
  });

  describe('setAdmin', () => {
    it('should work for valid address', async () => {
      const governance = await Governance.new(0);
      await governance.setAdmin(accounts[1]);
    });

    it('should revert for empty address', async () => {
      const governance = await Governance.new(0);

      let error;
      try {
        await governance.setAdmin(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });

  describe('setCustodian', () => {
    it('should work for valid address', async () => {
      await deployAndAssociateContracts();
    });

    it('should revert for empty address', async () => {
      const governance = await Governance.new(0);

      let error;
      try {
        await governance.setCustodian(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid address/i);
    });

    it('should revert after first call', async () => {
      const { custodian, governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.setCustodian(custodian.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/custodian can only be set once/i);
    });

    it('should revert when not called by admin', async () => {
      const { custodian, governance } = await deployAndAssociateContracts();
      await governance.setAdmin(accounts[1]);
      let error;
      try {
        await governance.setCustodian(custodian.address, { from: accounts[0] });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be admin/i);
    });
  });

  describe('initiateExchangeUpgrade', () => {
    it('should work for valid contract address', async () => {
      const {
        exchange: oldExchange,
        governance,
      } = await deployAndAssociateContracts();
      const newExchange = await Exchange.new();

      await governance.initiateExchangeUpgrade(newExchange.address);

      const events = await governance.getPastEvents(
        'ExchangeUpgradeInitiated',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.oldExchange).to.equal(oldExchange.address);
      expect(events[0].returnValues.newExchange).to.equal(newExchange.address);
      expect(parseInt(events[0].returnValues.blockThreshold, 10)).to.equal(
        await web3.eth.getBlockNumber(), // No delay
      );
    });

    it('should revert for invalid contract address', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.initiateExchangeUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid address/i);
    });

    it('should revert when upgrade already in progress', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newExchange = await Exchange.new();
      await governance.initiateExchangeUpgrade(newExchange.address);

      let error;
      try {
        await governance.initiateExchangeUpgrade(newExchange.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/exchange upgrade already in progress/i);
    });
  });

  describe('cancelExchangeUpgrade', () => {
    it('should work when in progress', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newExchange = await Exchange.new();

      await governance.initiateExchangeUpgrade(newExchange.address);
      await governance.cancelExchangeUpgrade();

      const events = await governance.getPastEvents('ExchangeUpgradeCanceled', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert when no upgrade in progress', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.cancelExchangeUpgrade();
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no exchange upgrade in progress/i);
    });
  });

  describe('finalizeExchangeUpgrade', () => {
    it('should work when in progress and addresses match', async () => {
      const { custodian, governance } = await deployAndAssociateContracts();
      const newExchange = await Exchange.new();

      await governance.initiateExchangeUpgrade(newExchange.address);
      await governance.finalizeExchangeUpgrade(newExchange.address);

      const events = await governance.getPastEvents(
        'ExchangeUpgradeFinalized',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(await custodian.getExchange.call()).to.equal(newExchange.address);
    });

    it('should revert when no upgrade in progress', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.finalizeExchangeUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no exchange upgrade in progress/i);
    });

    it('should revert on address mismatch', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newExchange = await Exchange.new();
      await governance.initiateExchangeUpgrade(newExchange.address);

      let error;
      try {
        await governance.finalizeExchangeUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/address mismatch/i);
    });

    it('should revert when block threshold not reached', async () => {
      const blockDelay = 10;
      const { governance } = await deployAndAssociateContracts(blockDelay);
      const newExchange = await Exchange.new();
      await governance.initiateExchangeUpgrade(newExchange.address);

      let error;
      try {
        await governance.finalizeExchangeUpgrade(newExchange.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/block threshold not yet reached/i);
    });
  });

  describe('initiateGovernanceUpgrade', () => {
    it('should work for valid contract address', async () => {
      const { governance: oldGovernance } = await deployAndAssociateContracts();
      const newGovernance = await Governance.new(0);

      await oldGovernance.initiateGovernanceUpgrade(newGovernance.address);

      const events = await oldGovernance.getPastEvents(
        'GovernanceUpgradeInitiated',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.oldGovernance).to.equal(
        oldGovernance.address,
      );
      expect(events[0].returnValues.newGovernance).to.equal(
        newGovernance.address,
      );
      expect(parseInt(events[0].returnValues.blockThreshold, 10)).to.equal(
        await web3.eth.getBlockNumber(), // No delay
      );
    });

    it('should revert for invalid contract address', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.initiateGovernanceUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid address/i);
    });

    it('should revert when upgrade already in progress', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newGovernance = await Governance.new(0);
      await governance.initiateGovernanceUpgrade(newGovernance.address);

      let error;
      try {
        await governance.initiateGovernanceUpgrade(newGovernance.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/governance upgrade already in progress/i);
    });
  });

  describe('cancelGovernanceUpgrade', () => {
    it('should work when in progress', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newGovernance = await Governance.new(0);

      await governance.initiateGovernanceUpgrade(newGovernance.address);
      await governance.cancelGovernanceUpgrade();

      const events = await governance.getPastEvents(
        'GovernanceUpgradeCanceled',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert when no upgrade in progress', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.cancelGovernanceUpgrade();
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no governance upgrade in progress/i);
    });
  });

  describe('finalizeGovernanceUpgrade', () => {
    it('should work when in progress and addresses match', async () => {
      const { custodian, governance } = await deployAndAssociateContracts();
      const newGovernance = await Governance.new(0);

      await governance.initiateGovernanceUpgrade(newGovernance.address);
      await governance.finalizeGovernanceUpgrade(newGovernance.address);

      const events = await governance.getPastEvents(
        'GovernanceUpgradeFinalized',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);

      expect(await custodian.getGovernance.call()).to.equal(
        newGovernance.address,
      );
    });

    it('should revert when no upgrade in progress', async () => {
      const { governance } = await deployAndAssociateContracts();

      let error;
      try {
        await governance.finalizeGovernanceUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no governance upgrade in progress/i);
    });

    it('should revert on address mismatch', async () => {
      const { governance } = await deployAndAssociateContracts();
      const newGovernance = await Governance.new(0);
      await governance.initiateGovernanceUpgrade(newGovernance.address);

      let error;
      try {
        await governance.finalizeGovernanceUpgrade(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/address mismatch/i);
    });

    it('should revert when called before block threshold reached', async () => {
      const { governance } = await deployAndAssociateContracts(10);
      const newGovernance = await Governance.new(10);
      await governance.initiateGovernanceUpgrade(newGovernance.address);

      let error;
      try {
        await governance.finalizeGovernanceUpgrade(newGovernance.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/block threshold not yet reached/i);
    });
  });
});
