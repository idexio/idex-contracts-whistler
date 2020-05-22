import { v1 as uuidv1 } from 'uuid';

import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';

import { getWithdrawArguments, getWithdrawalHash } from '../lib';
import {
  deployAndRegisterToken,
  ethAddress,
  ethSymbol,
  getSignature,
  minimumDecimalQuantity,
  minimumTokenQuantity,
  withdraw,
} from './helpers';

// TODO Balance changes for wallet, Exchange, and Custodian
// TODO Non-zero gas fees
contract('Exchange (withdrawals)', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');
  const SkimmingToken = artifacts.require('SkimmingTestToken');
  const Token = artifacts.require('TestToken');

  const tokenSymbol = 'TKN';

  describe('withdraw', () => {
    it('should work by symbol for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      await withdraw(
        web3,
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
        web3,
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

    it('should work by symbol for token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositToken(token.address, minimumTokenQuantity);

      await withdraw(
        web3,
        exchange,
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: minimumDecimalQuantity,
          autoDispatchEnabled: true,
          asset: tokenSymbol,
        },
        accounts[0],
      );

      const events = await exchange.getPastEvents('Withdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for unknown token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();
      await exchange.setDispatcher(accounts[0]);

      let error;
      try {
        await withdraw(
          web3,
          exchange,
          {
            nonce: uuidv1(),
            wallet: accounts[0],
            quantity: minimumDecimalQuantity,
            autoDispatchEnabled: true,
            assetContractAddress: token.address,
          },
          accounts[0],
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed asset found/i);
    });

    it('should revert when token skims from transfer', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      const token = await SkimmingToken.new();
      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositToken(token.address, minimumTokenQuantity);
      await token.setShouldSkim(true);

      let error;
      try {
        await withdraw(
          web3,
          exchange,
          {
            nonce: uuidv1(),
            wallet: accounts[0],
            quantity: minimumDecimalQuantity,
            autoDispatchEnabled: true,
            asset: tokenSymbol,
          },
          accounts[0],
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        / transfer success without expected balance change/i,
      );

      const events = await exchange.getPastEvents('Withdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(0);
    });

    it('should revert for invalid signature', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      const withdrawal = {
        nonce: uuidv1(),
        wallet: accounts[0],
        quantity: minimumDecimalQuantity,
        autoDispatchEnabled: true,
        asset: ethSymbol,
      };
      const [withdrawalStruct] = await getWithdrawArguments(
        withdrawal,
        '0.00000000',
        // Sign with a different wallet
        await getSignature(web3, getWithdrawalHash(withdrawal), accounts[1]),
      );

      let error;
      try {
        await exchange.withdraw(withdrawalStruct);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet signature/i);
    });

    it('should revert for exited wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });
      await exchange.exitWallet({ from: accounts[0] });

      let error;
      try {
        await withdraw(
          web3,
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
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/wallet exited/i);
    });

    it('should revert for excessive fee', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });

      let error;
      try {
        await withdraw(
          web3,
          exchange,
          {
            nonce: uuidv1(),
            wallet: accounts[0],
            quantity: minimumDecimalQuantity,
            autoDispatchEnabled: true,
            asset: ethSymbol,
          },
          accounts[0],
          minimumDecimalQuantity, // 100% fee
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/excessive withdrawal fee/i);
    });

    it('should revert for double withdrawal', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setDispatcher(accounts[0]);
      await exchange.depositEther({
        value: (BigInt(minimumTokenQuantity) * BigInt(2)).toString(),
        from: accounts[0],
      });
      const withdrawal = {
        nonce: uuidv1(),
        wallet: accounts[0],
        quantity: minimumDecimalQuantity,
        autoDispatchEnabled: true,
        asset: ethSymbol,
      };
      const [withdrawalStruct] = await getWithdrawArguments(
        withdrawal,
        '0',
        await getSignature(web3, getWithdrawalHash(withdrawal), accounts[0]),
      );

      await exchange.withdraw(withdrawalStruct);

      let error;
      try {
        await exchange.withdraw(withdrawalStruct);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/already withdrawn/i);
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
});
