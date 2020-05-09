import { deployAndAssociateContracts, minimumTokenQuantity } from './helpers';
import { ethAddress } from '../lib';

contract('Exchange', (accounts) => {
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
      expect(events[0].returnValues.asset).to.equal(ethAddress);
      expect(events[0].returnValues.quantity).to.equal(minimumTokenQuantity);
    });
  });
});
