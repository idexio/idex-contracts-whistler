import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  ethSymbol,
} from './helpers';
import { ethAddress } from '../lib';

contract('Exchange (tokens)', (accounts) => {
  const Token = artifacts.require('Token');
  const tokenSymbol = 'TKN';

  describe('registerToken', () => {
    it('should work', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
    });

    it('should revert when decimals exceed 18', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      let error;
      try {
        await exchange.registerToken(token.address, tokenSymbol, 19);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/decimals cannot exceed 18/i);
    });

    it('should revert when already finalized', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.registerToken(token.address, tokenSymbol, 18);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/already finalized/i);
    });
  });

  describe('confirmTokenRegistration', () => {
    it('should work', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
    });

    it('should revert for unknown token address', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();
      const unknownToken = await Token.new();
      await exchange.registerToken(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.confirmTokenRegistration(
          unknownToken.address,
          tokenSymbol,
          18,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/unknown token/i);
    });

    it('should revert when already finalized', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/already finalized/i);
    });

    it('should revert when symbols do not match', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.confirmTokenRegistration(
          token.address,
          `${tokenSymbol}123`,
          18,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/symbols do not match/i);
    });

    it('should revert when decimals do not match', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.confirmTokenRegistration(token.address, tokenSymbol, 17);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/decimals do not match/i);
    });
  });

  describe('tokenSymbolToAddress', () => {
    it('should work for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();

      const registeredAddress = await exchange.tokenSymbolToAddress(
        ethSymbol,
        new Date().getTime(),
      );

      expect(registeredAddress).to.equal(ethAddress);
    });

    it('should work for registered token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      const registeredAddress = await exchange.tokenSymbolToAddress(
        tokenSymbol,
        new Date().getTime(),
      );

      expect(registeredAddress).to.equal(token.address);
    });

    it('should revert when no token registered for symbol', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await exchange.tokenSymbolToAddress(
          `${tokenSymbol}123`,
          new Date().getTime(),
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no token found for symbol/i);
    });

    it('should revert when no token registered for symbol prior to timestamp', async () => {
      const timestampBeforeTokenRegistered = new Date().getTime() - 10000000;
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await exchange.tokenSymbolToAddress(
          tokenSymbol,
          timestampBeforeTokenRegistered,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no token found for symbol/i);
    });
  });
});
