import { ethAddress } from './helpers';

contract('Custodian', (accounts) => {
  const Custodian = artifacts.require('Custodian');

  describe('deploy', () => {
    it('should work', async () => {
      const [owner] = accounts;
      await Custodian.new(owner, owner);
    });

    it('should revert for invalid exchange address', async () => {
      const [owner] = accounts;

      let error;
      try {
        await Custodian.new(ethAddress, owner);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid exchange contract address/i);
    });

    it('should revert for invalid governance address', async () => {
      const [owner] = accounts;

      let error;
      try {
        await Custodian.new(owner, ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid governance contract address/i);
    });
  });

  describe('receive', () => {
    it('should work when sent from exchange address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      await web3.eth.sendTransaction({
        from: owner,
        to: custodian.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    });

    it('should revert when not sent from exchange address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await web3.eth.sendTransaction({
          from: accounts[1],
          to: custodian.address,
          value: web3.utils.toWei('1', 'ether'),
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be exchange/i);
    });
  });

  describe('setExchange', () => {
    it('should work when sent from governance address', async () => {
      const [owner, newExchange] = accounts;
      const custodian = await Custodian.new(owner, owner);

      await custodian.setExchange(newExchange);

      const events = await custodian.getPastEvents('ExchangeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
    });

    it('should revert for invalid address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await custodian.setExchange(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert when not sent from governance address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await custodian.setExchange(ethAddress, {
          from: accounts[1],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be governance/i);
    });
  });

  describe('setGovernance', () => {
    it('should work when sent from governance address', async () => {
      const [owner, newExchange] = accounts;
      const custodian = await Custodian.new(owner, owner);

      await custodian.setGovernance(newExchange);

      const events = await custodian.getPastEvents('GovernanceChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
    });

    it('should revert for invalid address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await custodian.setGovernance(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid contract address/i);
    });

    it('should revert when not sent from governance address', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await custodian.setGovernance(ethAddress, {
          from: accounts[1],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be governance/i);
    });
  });

  describe('withdraw', () => {
    it('should work when sent from exchange', async () => {
      const [owner, destinationWallet] = accounts;
      const custodian = await Custodian.new(owner, owner);
      await web3.eth.sendTransaction({
        from: owner,
        to: custodian.address,
        value: web3.utils.toWei('1', 'ether'),
      });

      await custodian.withdraw(
        destinationWallet,
        ethAddress,
        web3.utils.toWei('1', 'ether'),
      );

      const events = await custodian.getPastEvents('Withdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert when not sent from exchange', async () => {
      const [owner] = accounts;
      const custodian = await Custodian.new(owner, owner);

      let error;
      try {
        await custodian.withdraw(
          accounts[1],
          ethAddress,
          web3.utils.toWei('1', 'ether'),
          { from: accounts[1] },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be exchange/i);
    });
  });
});
