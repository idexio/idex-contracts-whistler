import { v1 as uuidv1 } from 'uuid';

import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  ethAddress,
} from './helpers';
import { deposit, executeTrade, generateOrdersAndFill } from './trade';

const tokenSymbol = 'TKN';

// These tests advance the block timestamp to test the nonce-timestamp filtering for the asset
// registry. Changing the block timestamp causes side effects for other tests that don't specifically
// handle it, so isolate these tests here
contract('Exchange (trades)', (accounts) => {
  describe('executeTrade', () => {
    it('should revert when buy order base asset is mismatched with trade', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);
      const oldTimestampMs =
        ((await web3.eth.getBlock('latest')).timestamp as number) * 1000;
      await increaseBlockTimestamp();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      const newTimestampMs =
        ((await web3.eth.getBlock('latest')).timestamp as number) * 1000;
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token.address,
        ethAddress,
        buyWallet,
        sellWallet,
      );
      buyOrder.nonce = uuidv1({ msecs: oldTimestampMs });
      sellOrder.nonce = uuidv1({ msecs: newTimestampMs });

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
        /buy order market symbol address resolution mismatch/i,
      );
    });

    it('should revert when sell order base asset is mismatched with trade', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);
      const oldTimestampMs =
        ((await web3.eth.getBlock('latest')).timestamp as number) * 1000;
      await increaseBlockTimestamp();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      const newTimestampMs =
        ((await web3.eth.getBlock('latest')).timestamp as number) * 1000;
      await exchange.setDispatcher(accounts[0]);
      const [sellWallet, buyWallet] = accounts;
      await deposit(exchange, token, buyWallet, sellWallet);

      const { buyOrder, sellOrder, fill } = await generateOrdersAndFill(
        token.address,
        ethAddress,
        buyWallet,
        sellWallet,
      );
      buyOrder.nonce = uuidv1({ msecs: newTimestampMs });
      sellOrder.nonce = uuidv1({ msecs: oldTimestampMs });

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
        /sell order market symbol address resolution mismatch/i,
      );
    });
  });
});

// https://docs.nethereum.com/en/latest/ethereum-and-clients/ganache-cli/#implemented-methods
const increaseBlockTimestamp = async (): Promise<void> => {
  await sendRpc('evm_increaseTime', [1]); // 1 second
  await sendRpc('evm_mine', []);
};

const sendRpc = async (method: string, params: unknown[]): Promise<unknown> =>
  new Promise((resolve, reject) => {
    (web3 as any).currentProvider.send(
      {
        jsonrpc: '2.0',
        method,
        params,
        id: new Date().getTime(),
      },
      (err: unknown, res: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      },
    );
  });
