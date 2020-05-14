import type { CustodianInstance } from '../types/truffle-contracts/Custodian';
import type { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import type { GovernanceInstance } from '../types/truffle-contracts/Governance';
import type { TestTokenInstance } from '../types/truffle-contracts/TestToken';
import type { Withdrawal } from '../lib';

import {
  decimalToTokenQuantity,
  getWithdrawArguments,
  getWithdrawalHash,
} from '../lib';

export const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);
export const ethSymbol = 'ETH';

// TODO Test tokens with decimals other than 18
export const minimumDecimalQuantity = '0.00000001';
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
): Promise<TestTokenInstance> => {
  const Token = artifacts.require('TestToken');
  const token = await Token.new();
  await exchange.registerToken(token.address, tokenSymbol, 18);
  await exchange.confirmTokenRegistration(token.address, tokenSymbol, 18);

  return token;
};

export const getSignature = async (
  web3: Web3,
  data: string,
  wallet: string,
): Promise<string> => {
  const signature = await web3.eth.sign(data, wallet);
  // https://github.com/OpenZeppelin/openzeppelin-contracts/issues/2190
  // The Ethereum spec requires a v value of 27 or 28, but ganache's RPC signature returns
  // a 0 or 1 instead. Add 27 in this case to make compatible with ECDSA recover
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) {
    v += 27;
  }
  const vHex = v.toString(16);
  return signature.slice(0, 130) + vHex;
};

export const withdraw = async (
  web3: Web3,
  exchange: ExchangeInstance,
  withdrawal: Withdrawal,
  wallet: string,
  gasFee = '0.00000000',
): Promise<void> => {
  const [
    withdrawalStruct,
    withdrawalTokenSymbol,
    withdrawalWalletSignature,
  ] = await getWithdrawArguments(
    withdrawal,
    gasFee,
    await getSignature(web3, getWithdrawalHash(withdrawal), wallet),
  );

  await exchange.withdraw(
    withdrawalStruct,
    withdrawalTokenSymbol,
    withdrawalWalletSignature,
  );
};
