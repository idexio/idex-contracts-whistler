import { deployAndAssociateContracts, minimumTokenQuantity } from './helpers';
import { ethAddress } from '../lib';

contract('Exchange (exits)', (accounts) => {
  describe('exitWallet', () => {
    it('should work for non-exited wallet', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.exitWallet({ from: accounts[0] });

      const events = await exchange.getPastEvents('WalletExited', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.wallet).to.equal(accounts[0]);
      expect(
        parseInt(events[0].returnValues.effectiveBlockNumber, 10),
      ).to.equal(await web3.eth.getBlockNumber());
    });

    it('should revert for wallet already exited', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.exitWallet({ from: accounts[0] });

      let error;
      try {
        await exchange.exitWallet({ from: accounts[0] });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/wallet already exited/i);
    });
  });

  describe('withdrawExit', () => {
    it('should work for ETH', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.depositEther({
        value: minimumTokenQuantity,
        from: accounts[0],
      });
      await exchange.exitWallet({ from: accounts[0] });

      await exchange.withdrawExit(ethAddress);

      const events = await exchange.getPastEvents('WalletExitWithdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.wallet).to.equal(accounts[0]);
      expect(events[0].returnValues.assetAddress).to.equal(ethAddress);
      expect(events[0].returnValues.quantityInAssetUnits).to.equal(
        minimumTokenQuantity,
      );
    });

    it('should revert for wallet not exited', async () => {
      const { exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.withdrawExit(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/wallet not yet exited/i);
    });

    it('should revert for wallet exit not finalized', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.setChainPropagationPeriod(10);
      await exchange.exitWallet({ from: accounts[0] });

      let error;
      try {
        await exchange.withdrawExit(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /wallet exit block delay not yet elapsed/i,
      );
    });

    it('should revert for asset with no balance', async () => {
      const { exchange } = await deployAndAssociateContracts();
      await exchange.exitWallet({ from: accounts[0] });

      let error;
      try {
        await exchange.withdrawExit(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/no balance for asset/i);
    });
  });
});
