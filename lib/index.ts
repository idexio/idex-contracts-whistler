import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { ExchangeInstance } from '../types/truffle-contracts/Exchange';

/** The fixed number of digits following the decimal in quantities expressed as pips */
export const pipsDecimals = 8;

enum WithdrawalType {
  BySymbol,
  ByAddress,
}

interface Withdrawal {
  nonce: string;
  wallet: string;
  quantity: string; // Decimal string
  autoDispatchEnabled: boolean; // Currently has no effect
  asset?: string;
  assetContractAddress?: string;
}

export const ethAddress = '0x0000000000000000000000000000000000000000';

export const getPrivateKeySigner = (walletPrivateKey: string) => (
  hashToSign: string,
): Promise<string> =>
  new ethers.Wallet(walletPrivateKey).signMessage(
    ethers.utils.arrayify(hashToSign),
  );

export const getWithdrawalHash = (withdrawal: Withdrawal): string => {
  if (
    (withdrawal.asset && withdrawal.assetContractAddress) ||
    (!withdrawal.asset && !withdrawal.assetContractAddress)
  ) {
    throw new Error(
      'Withdrawal must specify exactly one of asset or assetContractAddress',
    );
  }

  return solidityHashOfParams([
    ['uint128', uuidToUint8Array(withdrawal.nonce)],
    ['address', withdrawal.wallet],
    withdrawal.assetContractAddress
      ? ['address', withdrawal.assetContractAddress as string]
      : ['string', withdrawal.asset as string],
    ['string', withdrawal.quantity],
    ['bool', true], // autoDispatchEnabled
  ]);
};

export const getWithdrawArguments = async (
  withdrawal: Withdrawal,
  gasFee: string,
  signer: (hashToSign: string) => Promise<string>,
): Promise<ExchangeInstance['withdraw']['arguments']> => {
  return [
    {
      withdrawalType: withdrawal.assetContractAddress
        ? WithdrawalType.ByAddress
        : WithdrawalType.BySymbol,
      nonce: uuidToHexString(withdrawal.nonce),
      walletAddress: withdrawal.wallet,
      assetAddress: withdrawal.assetContractAddress || ethAddress,
      quantity: decimalToPips(withdrawal.quantity),
      gasFee,
      autoDispatchEnabled: true,
    },
    withdrawal.asset || '',
    await signer(getWithdrawalHash(withdrawal)),
  ];
};

type TypeValuePair =
  | ['string' | 'address', string]
  | ['uint128', string | Uint8Array]
  | ['uint8' | 'uint64', number]
  | ['bool', boolean];

const solidityHashOfParams = (params: TypeValuePair[]): string => {
  const fields = params.map((param) => param[0]);
  const values = params.map((param) => param[1]);
  return ethers.utils.solidityKeccak256(fields, values);
};

const uuidToUint8Array = (uuid: string): Uint8Array =>
  ethers.utils.arrayify(uuidToHexString(uuid));

const uuidToHexString = (uuid: string): string => `0x${uuid.replace(/-/g, '')}`;

/**
 * Convert decimal quantity string to integer pips as expected by contract structs. Truncates
 * anything beyond 8 decimals
 */
export const decimalToPips = (decimal: string): string =>
  new BigNumber(decimal)
    .shiftedBy(8)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();

/**
 * Convert pips to native token quantity, taking the nunmber of decimals into account
 */
export const pipsToTokenQuantity = (pips: string, decimals: number): string =>
  new BigNumber(pips.toString())
    .shiftedBy(decimals - 8) // This is still correct when decimals < 8
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();

export const decimalToTokenQuantity = (
  decimal: string,
  decimals: number,
): string => pipsToTokenQuantity(decimalToPips(decimal), decimals);
