import BigNumber from 'bignumber.js';
import { v1 as uuidv1 } from 'uuid';

import { deployAndAssociateContracts, deployAndRegisterToken } from './helpers';

import {
  decimalToTokenQuantity,
  Order,
  OrderSide,
  OrderType,
  getTradeArguments,
  Trade,
  getOrderHash,
} from '../lib';

// TODO Test tokens with decimals other than 18
contract('Exchange (trades)', (accounts) => {
  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
  const ethSymbol = 'ETH';
  const tokenSymbol = 'TKN';
  const marketSymbol = `${tokenSymbol}-${ethSymbol}`;

  describe('executeTrade', () => {
    it('should work for matching limit orders', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
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
});
