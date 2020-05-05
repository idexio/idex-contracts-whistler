contract('Exchange', (accounts) => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  it('should deploy', async () => {
    await Exchange.new();
  });

  it('should associate with Custodian', async () => {
    const blockDelay = 0;
    const [exchange, governance] = await Promise.all([
      Exchange.new(),
      Governance.new(blockDelay),
    ]);
    const custodian = await Custodian.new(exchange.address, governance.address);

    await exchange.setCustodian(custodian.address);
  });

  it('should revert associating Custodian more than once', async () => {
    const blockDelay = 0;
    const [exchange, governance] = await Promise.all([
      Exchange.new(),
      Governance.new(blockDelay),
    ]);
    const custodian = await Custodian.new(exchange.address, governance.address);
    await exchange.setCustodian(custodian.address);

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
