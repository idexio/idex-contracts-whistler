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

    // FIXME This test works when run singly but fails otherwise due to unknown side effect
    it.skip('should revert for empty address', async () => {
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
        await web3.eth.getBlockNumber(),
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
});
