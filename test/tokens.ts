import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  ethSymbol,
} from './helpers';
import { ethAddress } from '../lib';
import { TokensMockInstance } from '../types/truffle-contracts/TokensMock';

contract('Exchange (tokens)', (accounts) => {
  const Token = artifacts.require('TestToken');
  const TokensMock = artifacts.require('TokensMock');

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

  describe('getAddressForSymbol', () => {
    it('should work for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();

      const registeredAddress = await exchange.getAddressForSymbol(
        ethSymbol,
        new Date().getTime(),
      );

      expect(registeredAddress).to.equal(ethAddress);
    });

    it('should work for registered token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      const registeredAddress = await exchange.getAddressForSymbol(
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
        await exchange.getAddressForSymbol(
          `${tokenSymbol}123`,
          new Date().getTime(),
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed token found for symbol/i);
    });

    it('should revert when no token registered for symbol prior to timestamp', async () => {
      const timestampBeforeTokenRegistered = new Date().getTime() - 10000000;
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await exchange.getAddressForSymbol(
          tokenSymbol,
          timestampBeforeTokenRegistered,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed token found for symbol/i);
    });
  });

  describe('getTokenForSymbol', () => {
    it('should work for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();

      const token = await exchange.getTokenForSymbol(
        ethSymbol,
        new Date().getTime(),
      );

      expect(token.tokenAddress).to.equal(ethAddress);
    });
  });

  describe('tokenQuantityToPips', async () => {
    let tokensMock: TokensMockInstance;
    const tokenQuantityToPips = async (
      quantity: string,
      decimals: string,
    ): Promise<string> =>
      (await tokensMock.tokenQuantityToPips(quantity, decimals)).toString();

    beforeEach(async () => {
      tokensMock = await TokensMock.new();
    });

    it('should succeed', async () => {
      expect(await tokenQuantityToPips('10000000000', '18')).to.equal('1');
      expect(await tokenQuantityToPips('10000000000000', '18')).to.equal(
        '1000',
      );
      expect(await tokenQuantityToPips('1', '8')).to.equal('1');
      expect(await tokenQuantityToPips('1', '2')).to.equal('1000000');
      expect(await tokenQuantityToPips('1', '0')).to.equal('100000000');
    });

    it('should truncate fractions of a pip', async () => {
      expect(await tokenQuantityToPips('19', '9')).to.equal('1');
      expect(await tokenQuantityToPips('1', '9')).to.equal('0');
    });
  });

  describe('pipsToTokenQuantity', async () => {
    let tokensMock: TokensMockInstance;
    const pipsToTokenQuantity = async (
      quantity: string,
      decimals: string,
    ): Promise<string> =>
      (await tokensMock.pipsToTokenQuantity(quantity, decimals)).toString();

    beforeEach(async () => {
      tokensMock = await TokensMock.new();
    });

    it('should succeed', async () => {
      expect(await pipsToTokenQuantity('1', '18')).to.equal('10000000000');
      expect(await pipsToTokenQuantity('1000', '18')).to.equal(
        '10000000000000',
      );
      expect(await pipsToTokenQuantity('1', '8')).to.equal('1');
      expect(await pipsToTokenQuantity('1000000', '2')).to.equal('1');
      expect(await pipsToTokenQuantity('100000000', '0')).to.equal('1');
    });
  });
});
