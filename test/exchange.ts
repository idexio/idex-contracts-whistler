import { v1 as uuidv1 } from 'uuid';

import { CustodianInstance } from '../types/truffle-contracts/Custodian';
import { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import { GovernanceInstance } from '../types/truffle-contracts/Governance';
import { TokenInstance } from '../types/truffle-contracts';

import { getWithdrawArguments, decimalToTokenQuantity } from '../lib';

contract('Exchange', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');
  const Token = artifacts.require('Token');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
  const minimumDecimalQuantity = '0.00000001';
  // TODO Test tokens with decimals other than 18
  const minimumTokenQuantity = decimalToTokenQuantity(
    minimumDecimalQuantity,
    18,
  );

  it('should deploy', async () => {
    await Exchange.new();
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

  // TODO Verify balances
  describe('depositEther', () => {
    it('should work for minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      const events = await exchange.getPastEvents('Deposited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert below minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.depositEther({
          value: (BigInt(minimumTokenQuantity) - BigInt(1)).toString(),
          from: accounts[0],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Quantity is too low/i);
    });
  });

  describe('depositTokenBySymbol', () => {
    it('should work for minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange);

      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositTokenBySymbol('TKN', minimumTokenQuantity);

      const events = await exchange.getPastEvents('Deposited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });
  });

  describe('depositToken', () => {
    it('should work for minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange);

      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositToken(token.address, minimumTokenQuantity);

      const events = await exchange.getPastEvents('Deposited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });
  });

  describe('setChainPropagationDelay', () => {
    it('should work for value in bounds', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.setChainPropagationDelay('10');

      const events = await exchange.getPastEvents(
        'ChainPropagationDelayChanged',
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
        await exchange.setChainPropagationDelay('1000000000000000000000000');
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

  // TODO Verify balances
  // TODO Test gas fees
  describe('withdraw', () => {
    it('should work by symbol for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      const args = await getWithdrawArguments(
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: minimumDecimalQuantity,
          autoDispatchEnabled: true,
          asset: 'ETH',
        },
        '0',
        (hashToSign: string) => web3.eth.sign(hashToSign, accounts[0]),
      );
      // TODO Typescript doesn't like the spread syntax for args
      await exchange.withdraw(args[0], args[1], args[2]);

      const events = await exchange.getPastEvents('Withdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should work by address for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      const args = await getWithdrawArguments(
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: minimumDecimalQuantity,
          autoDispatchEnabled: true,
          assetContractAddress: ethAddress,
        },
        '0',
        (hashToSign: string) => web3.eth.sign(hashToSign, accounts[0]),
      );
      // TODO Typescript doesn't like the spread syntax for args
      await exchange.withdraw(args[0], args[1], args[2]);

      const events = await exchange.getPastEvents('Withdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });
  });

  const deployAndAssociateContracts = async (
    blockDelay = 0,
  ): Promise<{
    custodian: CustodianInstance;
    exchange: ExchangeInstance;
    governance: GovernanceInstance;
  }> => {
    const [exchange, governance] = await Promise.all([
      Exchange.new(),
      Governance.new(blockDelay),
    ]);
    const custodian = await Custodian.new(exchange.address, governance.address);
    await exchange.setCustodian(custodian.address);

    return { custodian, exchange, governance };
  };

  const deployAndRegisterToken = async (
    exchange: ExchangeInstance,
  ): Promise<TokenInstance> => {
    const token = await Token.new();
    await exchange.registerToken(token.address, 'TKN', 18);
    await exchange.confirmTokenRegistration(token.address, 'TKN', 18);

    return token;
  };
});
