import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  minimumTokenQuantity,
} from './helpers';
import { ethAddress } from '../lib';

contract('Exchange (deposits)', (accounts) => {
  const Exchange = artifacts.require('Exchange');
  const SkimmingToken = artifacts.require('SkimmingTestToken');
  const Token = artifacts.require('TestToken');

  const tokenSymbol = 'TKN';

  it('should revert when receiving ETH directly', async () => {
    const exchange = await Exchange.new();

    let error;
    try {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: exchange.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    } catch (e) {
      error = e;
    }
    expect(error).to.not.be.undefined;
    console.log(error.message);
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
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositTokenBySymbol(tokenSymbol, minimumTokenQuantity);

      const events = await exchange.getPastEvents('Deposited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await token.approve(exchange.address, minimumTokenQuantity);
        await exchange.depositTokenBySymbol('ETH', minimumTokenQuantity);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/use depositEther to deposit ether/i);
    });

    it('should revert for exited wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);
      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.exitWallet();

      let error;
      try {
        await exchange.depositTokenBySymbol(tokenSymbol, minimumTokenQuantity);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/wallet exited/i);
    });

    it('should revert when token quantity above wallet balance', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);
      const [, wallet] = accounts;

      let error;
      try {
        await exchange.depositTokenBySymbol(tokenSymbol, minimumTokenQuantity, {
          from: wallet,
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/token transfer failed/i);
    });

    it('should revert for unknown token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const [, wallet] = accounts;

      let error;
      try {
        await exchange.depositTokenBySymbol(tokenSymbol, minimumTokenQuantity, {
          from: wallet,
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed token found for symbol/i);
    });
  });

  describe('depositToken', () => {
    it('should work for minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      await token.approve(exchange.address, minimumTokenQuantity);
      await exchange.depositToken(token.address, minimumTokenQuantity);

      const events = await exchange.getPastEvents('Deposited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await token.approve(exchange.address, minimumTokenQuantity);
        await exchange.depositToken(ethAddress, minimumTokenQuantity);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/use depositEther to deposit ether/i);
    });

    it('should revert for unknown token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();
      const [, wallet] = accounts;

      let error;
      try {
        await exchange.depositToken(token.address, minimumTokenQuantity, {
          from: wallet,
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed token found for address/i);
    });

    it('should revert when token skims from transfer', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await SkimmingToken.new();
      await token.setShouldSkim(true);
      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
      await token.approve(exchange.address, minimumTokenQuantity);

      let error;
      try {
        await exchange.depositToken(token.address, minimumTokenQuantity);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /transfer success without expected balance change/i,
      );
    });
  });
});
