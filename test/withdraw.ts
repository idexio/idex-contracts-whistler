import BigNumber from 'bignumber.js';
import { v1 as uuidv1 } from 'uuid';

import type { CustodianInstance } from '../types/truffle-v5/Custodian';
import type { ExchangeInstance } from '../types/truffle-v5/Exchange';
import type { GovernanceInstance } from '../types/truffle-v5/Governance';

import {
  decimalToAssetUnits,
  decimalToPips,
  getWithdrawArguments,
  getWithdrawalHash,
} from '../lib';
import {
  deployAndRegisterToken,
  ethAddress,
  ethSymbol,
  getSignature,
  minimumDecimalQuantity,
  minimumTokenQuantity,
  withdraw,
} from './helpers';

// TODO Non-zero gas fees
contract('Exchange (withdrawals)', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');
  const NonCompliantToken = artifacts.require('NonCompliantToken');
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

      await assertWithdrawnEvent(
        exchange,
        accounts[0],
        ethAddress,
        ethSymbol,
        minimumDecimalQuantity,
      );

      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[0],
            ethAddress,
          )
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInPipsByAddress(accounts[0], ethAddress)
        ).toString(),
      ).to.equal('0');
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

      await assertWithdrawnEvent(
        exchange,
        accounts[0],
        ethAddress,
        ethSymbol,
        minimumDecimalQuantity,
      );

      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[0],
            ethAddress,
          )
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInPipsByAddress(accounts[0], ethAddress)
        ).toString(),
      ).to.equal('0');
    });

    it('should work by symbol for token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositTokenByAddress(token.address, minimumTokenQuantity);

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

      await assertWithdrawnEvent(
        exchange,
        accounts[0],
        token.address,
        tokenSymbol,
        minimumDecimalQuantity,
      );

      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[0],
            ethAddress,
          )
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInPipsByAddress(accounts[0], ethAddress)
        ).toString(),
      ).to.equal('0');
    });

    it('should work by symbol for non-compliant token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await NonCompliantToken.new();
      await exchange.setDispatcher(accounts[0]);

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositTokenByAddress(token.address, minimumTokenQuantity);

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

      await assertWithdrawnEvent(
        exchange,
        accounts[0],
        token.address,
        tokenSymbol,
        minimumDecimalQuantity,
      );

      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[0],
            ethAddress,
          )
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInPipsByAddress(accounts[0], ethAddress)
        ).toString(),
      ).to.equal('0');
    });

    it('should deduct fee', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await exchange.setDispatcher(accounts[0]);
      await exchange.setFeeWallet(accounts[1]);

      const tokenBalanceBefore = (
        await token.balanceOf(accounts[0])
      ).toString();
      const withdrawalAmount = new BigNumber(minimumDecimalQuantity)
        .multipliedBy(100)
        .toFixed(8);
      await token.approve(
        exchange.address,
        decimalToAssetUnits(withdrawalAmount, 18),
      );
      await exchange.depositTokenByAddress(
        token.address,
        decimalToAssetUnits(withdrawalAmount, 18),
      );

      await withdraw(
        web3,
        exchange,
        {
          nonce: uuidv1(),
          wallet: accounts[0],
          quantity: withdrawalAmount,
          autoDispatchEnabled: true,
          asset: tokenSymbol,
        },
        accounts[0],
        minimumDecimalQuantity,
      );

      await assertWithdrawnEvent(
        exchange,
        accounts[0],
        token.address,
        tokenSymbol,
        withdrawalAmount,
      );

      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[0],
            token.address,
          )
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInPipsByAddress(accounts[0], token.address)
        ).toString(),
      ).to.equal('0');
      expect(
        (
          await exchange.loadBalanceInAssetUnitsByAddress(
            accounts[1],
            token.address,
          )
        ).toString(),
      ).to.equal(minimumTokenQuantity);
      expect((await token.balanceOf(accounts[0])).toString()).to.equal(
        new BigNumber(tokenBalanceBefore)
          .minus(new BigNumber(minimumTokenQuantity))
          .toString(),
      );
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
      await exchange.depositTokenByAddress(token.address, minimumTokenQuantity);
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

  const assertWithdrawnEvent = async (
    exchange: ExchangeInstance,
    walletAddress: string,
    assetAddress: string,
    assetSymbol: string,
    decimalQuantity: string,
  ): Promise<void> => {
    const events = await exchange.getPastEvents('Withdrawn', {
      fromBlock: 0,
    });
    expect(events).to.be.an('array');
    expect(events.length).to.equal(1);
    expect(events[0].returnValues.wallet).to.equal(walletAddress);
    expect(events[0].returnValues.assetAddress).to.equal(assetAddress);
    expect(events[0].returnValues.assetSymbol).to.equal(assetSymbol);
    expect(events[0].returnValues.quantityInPips).to.equal(
      decimalToPips(decimalQuantity),
    );
    expect(events[0].returnValues.newExchangeBalanceInPips).to.equal(
      decimalToPips('0'),
    );
    expect(events[0].returnValues.newExchangeBalanceInAssetUnits).to.equal('0');
  };
});
