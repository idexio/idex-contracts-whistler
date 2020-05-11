import { v1 as uuidv1 } from 'uuid';

import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';

import {
  getWithdrawArguments,
  decimalToTokenQuantity,
  getWithdrawalHash,
  Withdrawal,
} from '../lib';

contract('Exchange (withdrawals)', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
  const ethSymbol = 'ETH';
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
