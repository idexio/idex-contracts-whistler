const Custodian = artifacts.require('Custodian');
const Exchange = artifacts.require('Exchange');
const Governance = artifacts.require('Governance');

contract('Exchange', (accounts) => {
  it('should deploy', async () => {
    const exchange = await Exchange.new();
  });
});

contract('Governance', (accounts) => {
  it('should deploy', async () => {
    const blockDelay = 0;
    const governance = await Governance.new(blockDelay);
  });
});

contract('Custodian', (accounts) => {
  it('should deploy', async () => {
    const blockDelay = 0;
    const [exchange, governance] = await Promise.all([
      Exchange.new(),
      Governance.new(blockDelay),
    ]);
    const custodian = await Custodian.new(exchange.address, governance.address);
  });
});
