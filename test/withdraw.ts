import { v1 as uuidv1 } from 'uuid';

import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';

import {
  decimalToTokenQuantity,
  getWithdrawArguments,
  getWithdrawalHash,
} from '../lib';
import { ethAddress, ethSymbol, getSignature, withdraw } from './helpers';

contract('Exchange (withdrawals)', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const minimumDecimalQuantity = '0.00000001';
  // TODO Test tokens with decimals other than 18
  const minimumTokenQuantity = decimalToTokenQuantity(
    minimumDecimalQuantity,
    18,
  );

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
      const [
        withdrawalStruct,
        withdrawalTokenSymbol,
        withdrawalWalletSignature,
      ] = await getWithdrawArguments(
        withdrawal,
        '0.00000000',
        // Sign with a different wallet
        await getSignature(web3, getWithdrawalHash(withdrawal), accounts[1]),
      );

      let error;
      try {
        await exchange.withdraw(
          withdrawalStruct,
          withdrawalTokenSymbol,
          withdrawalWalletSignature,
        );
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
      const [
        withdrawalStruct,
        withdrawalTokenSymbol,
        withdrawalWalletSignature,
      ] = await getWithdrawArguments(
        withdrawal,
        '0',
        await getSignature(web3, getWithdrawalHash(withdrawal), accounts[0]),
      );

      await exchange.withdraw(
        withdrawalStruct,
        withdrawalTokenSymbol,
        withdrawalWalletSignature,
      );

      let error;
      try {
        await exchange.withdraw(
          withdrawalStruct,
          withdrawalTokenSymbol,
          withdrawalWalletSignature,
        );
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
