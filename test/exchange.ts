import { deployAndAssociateContracts, ethSymbol } from './helpers';

contract('Exchange (tunable parameters)', (accounts) => {
  const Exchange = artifacts.require('Exchange');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

  it('should deploy', async () => {
    await Exchange.new();
  });

  it('should revert when receiving ETH directly', async () => {
    const exchange = await Exchange.new();

    let error;
    try {
      await web3.eth.sendTransaction({
        to: exchange.address,
        from: accounts[0],
        value: web3.utils.toWei('1', 'ether'),
      });
    } catch (e) {
      error = e;
    }

    expect(error).to.not.be.undefined;
    expect(error.message).to.match(/revert/i);
  });

  describe('loadBalanceInAssetUnitsByAddress', () => {
    it('should revert for invalid wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.loadBalanceInAssetUnitsByAddress(ethAddress, ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });

  describe('loadBalanceInPipsByAddress', () => {
    it('should revert for invalid wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.loadBalanceInPipsByAddress(ethAddress, ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });

  describe('loadBalanceInPipsBySymbol', () => {
    it('should revert for invalid wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.loadBalanceInPipsBySymbol(ethAddress, ethSymbol);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });

  describe('loadBalanceInAssetUnitsBySymbol', () => {
    it('should revert for invalid wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.loadBalanceInAssetUnitsBySymbol(ethAddress, ethSymbol);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });

  describe('setAdmin', async () => {
    it('should work for valid address', async () => {
      const exchange = await Exchange.new();

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

      expect(await exchange.loadFeeWallet()).to.equal(accounts[1]);
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
});
