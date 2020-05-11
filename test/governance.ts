import { deployAndAssociateContracts } from './helpers';

contract('Governance', (accounts) => {
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

  it('should deploy', async () => {
    await Governance.new(0);
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
  });

  describe('initiateGovernanceUpgrade', () => {
    it('should work for valid contract address', async () => {
      const {
        custodian,
        governance: oldGovernance,
      } = await deployAndAssociateContracts();
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
  });
});
