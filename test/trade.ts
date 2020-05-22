import BigNumber from 'bignumber.js';
import { v1 as uuidv1 } from 'uuid';

import type {
  ExchangeInstance,
  TestTokenInstance,
} from '../types/truffle-contracts';

import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  ethAddress,
  ethSymbol,
  getSignature,
} from './helpers';
import {
  decimalToPips,
  decimalToAssetUnits,
  getOrderHash,
  getTradeArguments,
  Order,
  OrderSide,
  OrderType,
  Trade,
  uuidToHexString,
} from '../lib';

const tokenSymbol = 'TKN';
const marketSymbol = `${tokenSymbol}-${ethSymbol}`;

// TODO Balance changes for wallet, Exchange, and Custodian
// TODO Advanced order types
// TODO Test tokens with decimals other than 18
contract('Exchange (trades)', (accounts) => {
  const Token = artifacts.require('TestToken');

  describe('executeTrade', () => {
    it('should work for matching limit orders', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const fill = await depositAndTrade(
        exchange,
        token,
        buyWallet,
        sellWallet,
      );

      const events = await exchange.getPastEvents('TradeExecuted', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);

      const { buyOrderHash, sellOrderHash } = events[0].returnValues;
      expect(
        (await exchange.balanceOf(buyWallet, token.address)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netBaseQuantity, 18));
      expect(
        (await exchange.balanceOf(sellWallet, ethAddress)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netQuoteQuantity, 18));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(buyOrderHash)
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(sellOrderHash)
        ).toString(),
      ).to.equal('0');
    });

    it('should work for matching maker limit and taker market order on quote terms', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      buyOrder.type = OrderType.Market;
      buyOrder.quoteOrderQuantity = fill.grossQuoteQuantity;

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      const events = await exchange.getPastEvents('TradeExecuted', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);

      const { buyOrderHash, sellOrderHash } = events[0].returnValues;
      expect(
        (await exchange.balanceOf(buyWallet, token.address)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netBaseQuantity, 18));
      expect(
        (await exchange.balanceOf(sellWallet, ethAddress)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netQuoteQuantity, 18));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(buyOrderHash)
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(sellOrderHash)
        ).toString(),
      ).to.equal('0');
    });

    it('should work for partial fill of matching limit orders', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .dividedBy(2)
        .toString();
      fill.netBaseQuantity = fill.grossBaseQuantity;
      fill.grossQuoteQuantity = new BigNumber(fill.grossQuoteQuantity)
        .dividedBy(2)
        .toString();
      fill.netQuoteQuantity = fill.grossQuoteQuantity;

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      const events = await exchange.getPastEvents('TradeExecuted', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);

      const { buyOrderHash, sellOrderHash } = events[0].returnValues;
      expect(
        (await exchange.balanceOf(buyWallet, token.address)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netBaseQuantity, 18));
      expect(
        (await exchange.balanceOf(sellWallet, ethAddress)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netQuoteQuantity, 18));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(buyOrderHash)
        ).toString(),
      ).to.equal(decimalToPips(fill.grossBaseQuantity));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(sellOrderHash)
        ).toString(),
      ).to.equal(decimalToPips(fill.grossBaseQuantity));
    });

    it('should work for partial fill of matching maker limit and taker market order in quote terms', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      sellOrder.type = OrderType.Market;
      sellOrder.quoteOrderQuantity = fill.grossQuoteQuantity;
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .dividedBy(2)
        .toString();
      fill.netBaseQuantity = fill.grossBaseQuantity;
      fill.grossQuoteQuantity = new BigNumber(fill.grossQuoteQuantity)
        .dividedBy(2)
        .toString();
      fill.netQuoteQuantity = fill.grossQuoteQuantity;

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      const events = await exchange.getPastEvents('TradeExecuted', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);

      const { buyOrderHash, sellOrderHash } = events[0].returnValues;
      expect(
        (await exchange.balanceOf(buyWallet, token.address)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netBaseQuantity, 18));
      expect(
        (await exchange.balanceOf(sellWallet, ethAddress)).toString(),
      ).to.equal(decimalToAssetUnits(fill.netQuoteQuantity, 18));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(buyOrderHash)
        ).toString(),
      ).to.equal(decimalToPips(fill.grossBaseQuantity));
      expect(
        (
          await exchange.partiallyFilledOrderQuantityInPips(sellOrderHash)
        ).toString(),
      ).to.equal(decimalToPips(fill.grossQuoteQuantity));
    });

    it('should revert for limit order with quoteOrderQuantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      buyOrder.quoteOrderQuantity = buyOrder.quantity;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /order quote quantity only valid for market orders/i,
      );
    });

    it('should revert when fill base net and fee do not sum to gross', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.takerFeeQuantity = new BigNumber(fill.takerFeeQuantity)
        .plus(new BigNumber('0.00000001'))
        .toFixed(8);

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /net base plus fee is not equal to gross/i,
      );
    });

    it('should revert when fill quote net and fee do not sum to gross', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.makerFeeQuantity = new BigNumber(fill.makerFeeQuantity)
        .plus(new BigNumber('0.00000001'))
        .toFixed(8);

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /net quote plus fee is not equal to gross/i,
      );
    });

    it('should revert for limit order overfill', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .multipliedBy(0.9)
        .toString();
      fill.netBaseQuantity = fill.grossBaseQuantity;
      fill.grossQuoteQuantity = new BigNumber(fill.grossQuoteQuantity)
        .multipliedBy(0.9)
        .toString();
      fill.netQuoteQuantity = fill.grossQuoteQuantity;

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/order overfill/i);
    });

    it('should revert for market order overfill on quote terms', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      buyOrder.type = OrderType.Market;
      buyOrder.quoteOrderQuantity = fill.grossQuoteQuantity;
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .multipliedBy(0.9)
        .toString();
      fill.netBaseQuantity = fill.grossBaseQuantity;
      fill.grossQuoteQuantity = new BigNumber(fill.grossQuoteQuantity)
        .multipliedBy(0.9)
        .toString();
      fill.netQuoteQuantity = fill.grossQuoteQuantity;

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/order overfill/i);
    });

    it('should revert when not called by dispatcher', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      const [sellWallet, buyWallet] = accounts;

      await deposit(exchange, token, buyWallet, sellWallet);
      await exchange.exitWallet({ from: buyWallet });

      let error;
      try {
        await generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller is not dispatcher/i);
    });

    it('should revert for exited buy wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      await deposit(exchange, token, buyWallet, sellWallet);
      await exchange.exitWallet({ from: buyWallet });

      let error;
      try {
        await generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/buy wallet exited/i);
    });

    it('should revert for exited sell wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      await deposit(exchange, token, buyWallet, sellWallet);
      await exchange.exitWallet({ from: sellWallet });

      let error;
      try {
        await generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/sell wallet exited/i);
    });

    it('should revert for invalidated buy nonce', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await exchange.invalidateOrderNonce(
        uuidToHexString(uuidv1({ msecs: new Date().getTime() + 100000 })),
        { from: buyWallet },
      );

      await deposit(exchange, token, buyWallet, sellWallet);

      let error;
      try {
        await generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/buy order nonce timestamp too low/i);
    });

    it('should revert for invalidated sell nonce', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await exchange.invalidateOrderNonce(
        uuidToHexString(uuidv1({ msecs: new Date().getTime() + 100000 })),
        { from: sellWallet },
      );

      await deposit(exchange, token, buyWallet, sellWallet);

      let error;
      try {
        await generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/sell order nonce timestamp too low/i);
    });

    it('should revert for unconfirmed base asset', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();
      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed asset found for symbol/i);
    });

    it('should revert for invalid signatureHashVersion', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      buyOrder.signatureHashVersion = 2;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/signature hash version must be 1/i);
    });

    it('should revert for invalid signature', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      const [buySignature, sellSignature] = await Promise.all([
        getSignature(web3, getOrderHash(buyOrder), buyWallet),
        // Sign with wrong wallet
        getSignature(web3, getOrderHash(sellOrder), buyWallet),
      ]);

      let error;
      try {
        // https://github.com/microsoft/TypeScript/issues/28486
        await (exchange.executeTrade as any)(
          ...getTradeArguments(
            buyOrder,
            buySignature,
            sellOrder,
            sellSignature,
            fill,
          ),
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet signature/i);
    });

    it('should revert for excessive taker fee', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.takerFeeQuantity = fill.grossBaseQuantity;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive taker fee/i);
    });

    it('should revert for excessive maker fee', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.makerFeeQuantity = fill.grossQuoteQuantity;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive maker fee/i);
    });

    it('should revert for zero base quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossBaseQuantity = '0';

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /base quantity must be greater than zero/i,
      );
    });

    it('should revert for zero quote quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossQuoteQuantity = '0';

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /quote quantity must be greater than zero/i,
      );
    });

    it('should revert when buy limit price exceeded', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .minus(1)
        .toString();

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/buy order limit price exceeded/i);
    });

    it('should revert when sell limit price exceeded', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.grossBaseQuantity = new BigNumber(fill.grossBaseQuantity)
        .plus(1)
        .toString();

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/sell order limit price exceeded/i);
    });

    it('should revert when base and quote assets are the same', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      buyOrder.market = `${ethSymbol}-${ethSymbol}`;
      sellOrder.market = `${ethSymbol}-${ethSymbol}`;
      fill.baseAssetAddress = ethAddress;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /base and quote assets must be different/i,
      );
    });

    it('should revert when maker fee asset not in trade pair', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      const token2Symbol = `${tokenSymbol}2`;
      const token2 = await deployAndRegisterToken(exchange, token2Symbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.makerFeeAssetAddress = token2.address;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/maker fee asset is not in trade pair/i);
    });

    it('should revert when taker fee asset not in trade pair', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      const token2Symbol = `${tokenSymbol}2`;
      const token2 = await deployAndRegisterToken(exchange, token2Symbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.takerFeeAssetAddress = token2.address;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/taker fee asset is not in trade pair/i);
    });

    it('should revert when maker and taker fee assets are the same', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );
      fill.makerFeeAssetAddress = fill.takerFeeAssetAddress;

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /maker and taker fee assets must be different/i,
      );
    });

    it('should revert on double fill', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token,
        buyWallet,
        sellWallet,
      );

      await executeTrade(
        exchange,
        buyWallet,
        sellWallet,
        buyOrder,
        sellOrder,
        fill,
      );

      let error;
      try {
        await executeTrade(
          exchange,
          buyWallet,
          sellWallet,
          buyOrder,
          sellOrder,
          fill,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/order double filled/i);
    });
  });
});

export const deposit = async (
  exchange: ExchangeInstance,
  token: TestTokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<void> => {
  const quantity = '10.00000000';
  const price = '0.10000000'; // 1 ETH buys 10 TKN
  const quoteQuantity = new BigNumber(quantity)
    .multipliedBy(new BigNumber(price))
    .toFixed(8, BigNumber.ROUND_DOWN);

  await token.approve(exchange.address, decimalToAssetUnits(quantity, 18), {
    from: sellWallet,
  });
  await exchange.depositToken(
    token.address,
    decimalToAssetUnits(quantity, 18),
    {
      from: sellWallet,
    },
  );
  await exchange.depositEther({
    value: decimalToAssetUnits(quoteQuantity, 18),
    from: buyWallet,
  });
};

export const executeTrade = async (
  exchange: ExchangeInstance,
  buyWallet: string,
  sellWallet: string,
  buyOrder: Order,
  sellOrder: Order,
  fill: Trade,
): Promise<void> => {
  const [buySignature, sellSignature] = await Promise.all([
    getSignature(web3, getOrderHash(buyOrder), buyWallet),
    getSignature(web3, getOrderHash(sellOrder), sellWallet),
  ]);

  // https://github.com/microsoft/TypeScript/issues/28486
  await (exchange.executeTrade as any)(
    ...getTradeArguments(
      buyOrder,
      buySignature,
      sellOrder,
      sellSignature,
      fill,
    ),
  );
};

export const generateOrdersAndFill = async (
  token: TestTokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<{ buyOrder: Order; sellOrder: Order; fill: Trade }> => {
  const quantity = '10.00000000';
  const price = '0.10000000'; // 1 ETH buys 10 TKN
  const quoteQuantity = new BigNumber(quantity)
    .multipliedBy(new BigNumber(price))
    .toFixed(8, BigNumber.ROUND_DOWN);

  const sellOrder: Order = {
    signatureHashVersion: 1,
    nonce: uuidv1(),
    wallet: sellWallet,
    market: marketSymbol,
    type: OrderType.Limit,
    side: OrderSide.Sell,
    quantity,
    price,
  };

  const buyOrder: Order = {
    signatureHashVersion: 1,
    nonce: uuidv1(),
    wallet: buyWallet,
    market: marketSymbol,
    type: OrderType.Limit,
    side: OrderSide.Buy,
    quantity,
    price,
  };

  const fill: Trade = {
    baseAssetAddress: token.address,
    quoteAssetAddress: ethAddress,
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

  return { buyOrder, sellOrder, fill };
};

const depositAndTrade = async (
  exchange: ExchangeInstance,
  token: TestTokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<Trade> => {
  await deposit(exchange, token, buyWallet, sellWallet);
  return generateAndExecuteTrade(exchange, token, buyWallet, sellWallet);
};

const generateAndExecuteTrade = async (
  exchange: ExchangeInstance,
  token: TestTokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<Trade> => {
  const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
    token,
    buyWallet,
    sellWallet,
  );
  await executeTrade(
    exchange,
    buyWallet,
    sellWallet,
    buyOrder,
    sellOrder,
    fill,
  );

  return fill;
};
