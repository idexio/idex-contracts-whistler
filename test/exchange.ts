import { CustodianInstance } from '../types/truffle-contracts/Custodian';
import { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import { GovernanceInstance } from '../types/truffle-contracts/Governance';

contract('Exchange', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

  it('should deploy', async () => {
    await Exchange.new();
  });

  describe('setCustodian', () => {
    it('should work for valid address', async () => {
      await deployAndAssociateContracts();
    });

    it('should revert for empty address', async () => {
      const exchange = await Exchange.new();

      let error;
      try {
        await exchange.setCustodian(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid address/i);
    });

    it('should revert after first call', async () => {
      const { custodian, exchange } = await deployAndAssociateContracts();

      let error;
      try {
        await exchange.setCustodian(custodian.address);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/custodian can only be set once/i);
    });
  });

  // TODO Verify balances
  describe('depositEther', () => {
    it('should work for minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const minimumDeposit = BigInt(10) ** BigInt(10);

      await exchange.depositEther({
        value: minimumDeposit.toString(),
        from: accounts[0],
      });

      const events = await exchange.getPastEvents('Deposited');
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });

    it('should revert below minimum quantity', async () => {
      const { exchange } = await deployAndAssociateContracts();
      const minimumDeposit = BigInt(10) ** BigInt(10);

      let error;
      try {
        await exchange.depositEther({
          value: (minimumDeposit - BigInt(1)).toString(),
          from: accounts[0],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Quantity is too low/i);
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
