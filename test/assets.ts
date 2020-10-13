import BigNumber from 'bignumber.js';

import {
  deployAndAssociateContracts,
  deployAndRegisterToken,
  ethSymbol,
} from './helpers';
import { ethAddress } from '../lib';
import { AssetsMockInstance } from '../types/truffle-contracts/AssetsMock';

contract('Exchange (tokens)', () => {
  const AssetsMock = artifacts.require('AssetsMock');
  const Token = artifacts.require('TestToken');

  const tokenSymbol = 'TKN';

  describe('registerToken', () => {
    it('should work', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
    });

    it('should revert when token has too many decimals', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      let error;
      try {
        await exchange.registerToken(token.address, tokenSymbol, 100);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /token cannot have more than 32 decimals/i,
      );
    });

    it('should revert for ETH address', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.registerToken(ethAddress, tokenSymbol, 18);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid token address/i);
    });

    it('should revert for blank symbol', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      let error;
      try {
        await exchange.registerToken(token.address, '', 18);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid token symbol/i);
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
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
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
      expect(error.message).to.match(/unknown asset/i);
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

  describe('addTokenSymbol', () => {
    it('should work', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);
      await exchange.addTokenSymbol(token.address, 'NEW');

      const events = await exchange.getPastEvents('TokenSymbolAdded', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.assetAddress).to.equal(token.address);
      expect(events[0].returnValues.assetSymbol).to.equal('NEW');
    });

    it('should revert for unregistered token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      let error;
      try {
        await exchange.addTokenSymbol(token.address, 'NEW');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/unknown asset/i);
    });

    it('should revert for unconfirmed token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.addTokenSymbol(token.address, 'NEW');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/not finalized/i);
    });

    it('should revert for reserved ETH symbol', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.addTokenSymbol(token.address, 'ETH');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/ETH symbol reserved/i);
    });

    it('should revert for ETH address', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await Token.new();

      await exchange.registerToken(token.address, tokenSymbol, 18);
      await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

      let error;
      try {
        await exchange.addTokenSymbol(ethAddress, 'TKN');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/not finalized/i);
    });
  });

  describe('loadAssetBySymbol', () => {
    it('should work for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();

      const registeredAddress = (
        await exchange.loadAssetBySymbol(ethSymbol, new Date().getTime())
      ).assetAddress;

      expect(registeredAddress).to.equal(ethAddress);
    });

    it('should work for registered token', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const token = await deployAndRegisterToken(exchange, tokenSymbol);

      const registeredAddress = (
        await exchange.loadAssetBySymbol(tokenSymbol, new Date().getTime())
      ).assetAddress;

      expect(registeredAddress).to.equal(token.address);
    });

    it('should revert when no token registered for symbol', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await exchange.loadAssetBySymbol(
          `${tokenSymbol}123`,
          new Date().getTime(),
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed asset found for symbol/i);
    });

    it('should revert when no token registered for symbol prior to timestamp', async () => {
      const timestampBeforeTokenRegistered = new Date().getTime() - 10000000;
      const { exchange } = await deployAndAssociateContracts();
      await deployAndRegisterToken(exchange, tokenSymbol);

      let error;
      try {
        await exchange.loadAssetBySymbol(
          tokenSymbol,
          timestampBeforeTokenRegistered,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no confirmed asset found for symbol/i);
    });
  });

  describe('assetUnitsToPips', async () => {
    let assetsMock: AssetsMockInstance;
    const assetUnitsToPips = async (
      quantity: string,
      decimals: string,
    ): Promise<string> =>
      (await assetsMock.assetUnitsToPips(quantity, decimals)).toString();

    beforeEach(async () => {
      assetsMock = await AssetsMock.new();
    });

    it('should succeed', async () => {
      expect(await assetUnitsToPips('10000000000', '18')).to.equal('1');
      expect(await assetUnitsToPips('10000000000000', '18')).to.equal('1000');
      expect(await assetUnitsToPips('1', '8')).to.equal('1');
      expect(await assetUnitsToPips('1', '2')).to.equal('1000000');
      expect(await assetUnitsToPips('1', '0')).to.equal('100000000');
    });

    it('should truncate fractions of a pip', async () => {
      expect(await assetUnitsToPips('19', '9')).to.equal('1');
      expect(await assetUnitsToPips('1', '9')).to.equal('0');
    });

    it('should revert on uint64 overflow', async () => {
      let error;
      try {
        await assetUnitsToPips(
          new BigNumber(2).exponentiatedBy(128).toFixed(),
          '8',
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/pip quantity overflows uint64/i);
    });

    it('should revert when token has too many decimals', async () => {
      let error;
      try {
        await assetUnitsToPips(new BigNumber(1).toFixed(), '100');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /asset cannot have more than 32 decimals/i,
      );
    });
  });

  describe('pipsToAssetUnits', async () => {
    let assetsMock: AssetsMockInstance;
    const pipsToAssetUnits = async (
      quantity: string,
      decimals: string,
    ): Promise<string> =>
      (await assetsMock.pipsToAssetUnits(quantity, decimals)).toString();

    beforeEach(async () => {
      assetsMock = await AssetsMock.new();
    });

    it('should succeed', async () => {
      expect(await pipsToAssetUnits('1', '18')).to.equal('10000000000');
      expect(await pipsToAssetUnits('1000', '18')).to.equal('10000000000000');
      expect(await pipsToAssetUnits('1', '8')).to.equal('1');
      expect(await pipsToAssetUnits('1000000', '2')).to.equal('1');
      expect(await pipsToAssetUnits('100000000', '0')).to.equal('1');
    });

    it('should revert when token has too many decimals', async () => {
      let error;
      try {
        await pipsToAssetUnits(new BigNumber(1).toFixed(), '100');
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /asset cannot have more than 32 decimals/i,
      );
    });
  });
});
