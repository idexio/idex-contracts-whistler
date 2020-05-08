import BigNumber from 'bignumber.js';
import { v1 as uuidv1 } from 'uuid';

import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';
import type { TokenInstance } from '../types/truffle-contracts';

import {
  getWithdrawArguments,
  decimalToTokenQuantity,
  Order,
  OrderSide,
  OrderType,
  getTradeArguments,
  getWithdrawalHash,
  Trade,
  Withdrawal,
  getOrderHash,
} from '../lib';

contract('Exchange', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');
  const Token = artifacts.require('Token');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
  const ethSymbol = 'ETH';
  const tokenSymbol = 'TKN';
  const marketSymbol = `${tokenSymbol}-${ethSymbol}`;
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
      await exchange.depositTokenBySymbol(tokenSymbol, minimumTokenQuantity);

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

  describe('executeTrade', () => {
    it('should work for matching limit orders', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      const quantity = '10.00000000';
      const price = '0.10000000'; // 1 ETH buys 10 TKN
      const quoteQuantity = new BigNumber(quantity)
        .multipliedBy(new BigNumber(price))
        .toFixed(8, BigNumber.ROUND_DOWN);

      await token.approve(
        exchange.address,
        decimalToTokenQuantity(quantity, 18),
        {
          from: sellWallet,
        },
      );
      await exchange.depositToken(
        token.address,
        decimalToTokenQuantity(quantity, 18),
        {
          from: sellWallet,
        },
      );
      await exchange.depositEther({
        value: decimalToTokenQuantity(quoteQuantity, 18),
        from: buyWallet,
      });

      const sellOrder: Order = {
        nonce: uuidv1(),
        wallet: sellWallet,
        market: marketSymbol,
        type: OrderType.Limit,
        side: OrderSide.Sell,
        quantity,
        price,
        baseAssetAddress: token.address,
        quoteAssetAddress: ethAddress,
        totalQuantity: quantity,
      };
      const sellSignature = await web3.eth.sign(
        getOrderHash(sellOrder),
        sellWallet,
      );
      const buyOrder: Order = {
        nonce: uuidv1(),
        wallet: buyWallet,
        market: marketSymbol,
        type: OrderType.Limit,
        side: OrderSide.Buy,
        quantity,
        price,
        baseAssetAddress: token.address,
        quoteAssetAddress: ethAddress,
        totalQuantity: quantity,
      };
      const buySignature = await web3.eth.sign(
        getOrderHash(buyOrder),
        buyWallet,
      );

      const fill: Trade = {
        grossBaseQuantity: quantity,
        grossQuoteQuantity: quoteQuantity,
        netBaseQuantity: quantity, // No fee
        netQuoteQuantity: quoteQuantity, // No fee
        makerFeeAssetAddress: ethAddress,
        takerFeeAssetAddress: token.address,
        makerFeeQuantity: '0',
        takerFeeQuantity: '0',
        price,
        makerSide: OrderSide.Sell,
      };

      const [
        buy,
        buyBaseSymbol,
        buyQuoteSymbol,
        buyClientOrderId,
        buyWalletSignature,
        sell,
        sellBaseSymbol,
        sellQuoteSymbol,
        sellClientOrderId,
        sellWalletSignature,
        trade,
      ] = getTradeArguments(
        buyOrder,
        buySignature,
        sellOrder,
        sellSignature,
        fill,
      );
      await exchange.executeTrade(
        buy,
        buyBaseSymbol,
        buyQuoteSymbol,
        buyClientOrderId,
        buyWalletSignature,
        sell,
        sellBaseSymbol,
        sellQuoteSymbol,
        sellClientOrderId,
        sellWalletSignature,
        trade,
      );

      const events = await exchange.getPastEvents('ExecutedTrade', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
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

      await withdraw(
        exchange,
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: minimumDecimalQuantity,
          autoDispatchEnabled: true,
          asset: ethSymbol,
        },
        accounts[0],
      );

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

      await withdraw(
        exchange,
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: minimumDecimalQuantity,
          autoDispatchEnabled: true,
          assetContractAddress: ethAddress,
        },
        accounts[0],
      );

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
    await exchange.registerToken(token.address, tokenSymbol, 18);
    await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

    return token;
  };

  const withdraw = async (
    exchange: ExchangeInstance,
    withdrawal: Withdrawal,
    wallet: string,
  ): Promise<void> => {
    const [
      withdrawalStruct,
      withdrawalTokenSymbol,
      withdrawalWalletSignature,
    ] = await getWithdrawArguments(
      withdrawal,
      '0',
      await web3.eth.sign(getWithdrawalHash(withdrawal), wallet),
    );

    await exchange.withdraw(
      withdrawalStruct,
      withdrawalTokenSymbol,
      withdrawalWalletSignature,
    );
  };
});
