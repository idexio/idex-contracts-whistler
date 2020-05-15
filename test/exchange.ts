import { deployAndAssociateContracts } from './helpers';

contract('Exchange (tunable parameters)', (accounts) => {
  const Exchange = artifacts.require('Exchange');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

  it('should deploy', async () => {
    await Exchange.new();
  });

  describe('setAdmin', async () => {
    it('should work for valid address', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setAdmin(accounts[1]);
    });

    it('should revert for empty address', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setAdmin(ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });

    it('should revert for setting same address as current', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setAdmin(accounts[1]);

      let error;
      try {
        await exchange.setAdmin(accounts[1]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be different/i);
    });

    it('should revert when not called by owner', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setAdmin(accounts[1], { from: accounts[1] });
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be owner/i);
    });
  });

  describe('removeAdmin', async () => {
    it('should work', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.removeAdmin();
    });
  });

  describe('setCustodian', () => {
    it('should work for valid address', async () => {
      await deployAndAssociateContracts();
    });

    it('should revert for empty address', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setCustodian(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid address/i);
    });

    it('should revert after first call', async () => {
      const { custodian, exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setCustodian(custodian.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/custodian can only be set once/i);
    });
  });

  describe('setChainPropagationPeriod', () => {
    it('should work for value in bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setChainPropagationPeriod('10');

      const events = await exchange.getPastEvents(
        'ChainPropagationPeriodChanged',
        {
          fromBlock: 0,
        },
      );
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for value out of bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setChainPropagationPeriod('1000000000000000000000000');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be less than/i);
    });
  });

  describe('setDispatcher', () => {
    it('should work for valid address', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setDispatcher(accounts[1]);

      const events = await exchange.getPastEvents('DispatcherChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for empty address', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setDispatcher(ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });

    it('should revert for setting same address as current', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[1]);

      let error;
      try {
        await exchange.setDispatcher(accounts[1]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be different/i);
    });
  });

  describe('removeDispatcher', () => {
    it('should set wallet to zero', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setDispatcher(accounts[1]);
      await exchange.removeDispatcher();

      const events = await exchange.getPastEvents('DispatcherChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
      expect(events[1].returnValues.newValue).to.equal(ethAddress);
    });
  });

  describe('setFeeWallet', () => {
    it('should work for valid address', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setFeeWallet(accounts[1]);

      const events = await exchange.getPastEvents('FeeWalletChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for empty address', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setFeeWallet(ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });

    it('should revert for setting same address as current', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setFeeWallet(accounts[1]);

      let error;
      try {
        await exchange.setFeeWallet(accounts[1]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be different/i);
    });
  });

  describe('setWithdrawalFeeBasisPoints', () => {
    it('should work for value in bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setWithdrawalFeeBasisPoints('10');

      const events = await exchange.getPastEvents('WithdrawalFeeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for value out of bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setWithdrawalFeeBasisPoints('1000000000000000000000000');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive withdrawal fee/i);
    });
  });

  describe('setTradeMakerFeeBasisPoints', () => {
    it('should work for value in bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setTradeMakerFeeBasisPoints('10');

      const events = await exchange.getPastEvents('TradeMakerFeeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for value out of bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setTradeMakerFeeBasisPoints('1000000000000000000000000');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive maker fee/i);
    });
  });

  describe('setTradeTakerFeeBasisPoints', () => {
    it('should work for value in bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setTradeTakerFeeBasisPoints('10');

      const events = await exchange.getPastEvents('TradeTakerFeeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for value out of bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setTradeTakerFeeBasisPoints('1000000000000000000000000');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive taker fee/i);
    });
  });
});
