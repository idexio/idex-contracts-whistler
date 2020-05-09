import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';
import type { TokenInstance } from '../types/truffle-contracts';

import { decimalToTokenQuantity } from '../lib';

export const minimumDecimalQuantity = '0.00000001';
// TODO Test tokens with decimals other than 18
export const minimumTokenQuantity = decimalToTokenQuantity(
  minimumDecimalQuantity,
  18,
);
export const deployAndAssociateContracts = async (
  blockDelay = 0,
): Promise<{
  custodian: CustodianInstance;
  exchange: ExchangeInstance;
  governance: GovernanceInstance;
}> => {
  const Custodian = artifacts.require('Custodian');
  const Exchange = artifacts.require('Exchange');
  const Governance = artifacts.require('Governance');

  const [exchange, governance] = await Promise.all([
    Exchange.new(),
    Governance.new(blockDelay),
  ]);
  const custodian = await Custodian.new(exchange.address, governance.address);
  await exchange.setCustodian(custodian.address);
  await governance.setCustodian(custodian.address);

  return { custodian, exchange, governance };
};

export const deployAndRegisterToken = async (
  exchange: ExchangeInstance,
  tokenSymbol: string,
): Promise<TokenInstance> => {
  const Token = artifacts.require('Token');
  const token = await Token.new();
  await exchange.registerToken(token.address, tokenSymbol, 18);
  await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

  return token;
};
