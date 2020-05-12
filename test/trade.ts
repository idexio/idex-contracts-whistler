import BigNumber from 'bignumber.js';
import { v1 as uuidv1 } from 'uuid';

import type {
  ExchangeInstance,
  TokenInstance,
} from '../types/truffle-contracts';

import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  getSignature,
} from './helpers';
import {
  decimalToTokenQuantity,
  Order,
  OrderSide,
  OrderType,
  getTradeArguments,
  Trade,
  getOrderHash,
} from '../lib';

const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
const ethSymbol = 'ETH';
const tokenSymbol = 'TKN';
const marketSymbol = `${tokenSymbol}-${ethSymbol}`;

// TODO Test tokens with decimals other than 18
contract('Exchange (trades)', (accounts) => {
  describe('executeTrade', () => {
    it('should work for matching limit orders', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;

      await depositAndTrade(exchange, token, buyWallet, sellWallet);

      const events = await exchange.getPastEvents('ExecutedTrade', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
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
        await executeTrade(exchange, token, buyWallet, sellWallet);
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
        await executeTrade(exchange, token, buyWallet, sellWallet);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/sell wallet exited/i);
    });
  });
});

const depositAndTrade = async (
  exchange: ExchangeInstance,
  token: TokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<void> => {
  await deposit(exchange, token, buyWallet, sellWallet);
  await executeTrade(exchange, token, buyWallet, sellWallet);
};

const deposit = async (
  exchange: ExchangeInstance,
  token: TokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<void> => {
  const quantity = '10.00000000';
  const price = '0.10000000'; // 1 ETH buys 10 TKN
  const quoteQuantity = new BigNumber(quantity)
    .multipliedBy(new BigNumber(price))
    .toFixed(8, BigNumber.ROUND_DOWN);

  await token.approve(exchange.address, decimalToTokenQuantity(quantity, 18), {
    from: sellWallet,
  });
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
};

const executeTrade = async (
  exchange: ExchangeInstance,
  token: TokenInstance,
  buyWallet: string,
  sellWallet: string,
): Promise<void> => {
  const quantity = '10.00000000';
  const price = '0.10000000'; // 1 ETH buys 10 TKN
  const quoteQuantity = new BigNumber(quantity)
    .multipliedBy(new BigNumber(price))
    .toFixed(8, BigNumber.ROUND_DOWN);

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
  const sellSignature = await getSignature(
    web3,
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
  const buySignature = await getSignature(
    web3,
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

  // TODO Passing args by spread syntax would be great here, but TS is a hard nope
  // https://github.com/microsoft/TypeScript/issues/28486
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
  ] = getTradeArguments(buyOrder, buySignature, sellOrder, sellSignature, fill);
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
};
