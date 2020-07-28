import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

export type SolidityHashParameter =
  | ['string' | 'address', string]
  | ['uint128', string | Uint8Array]
  | ['uint8' | 'uint64', number]
  | ['bool', boolean];

export const solidityHash = (parameters: SolidityHashParameter[]): string => {
  const fields = parameters.map((param) => param[0]);
  const values = parameters.map((param) => param[1]);
  return ethers.utils.solidityKeccak256(fields, values);
};

export const uuidToUint8Array = (uuid: string): Uint8Array =>
  ethers.utils.arrayify(uuidToHexString(uuid));

export const uuidToHexString = (uuid: string): string =>
  `0x${uuid.replace(/-/g, '')}`;

/**
 * Convert decimal quantity string to integer pips as expected by contract structs. Truncates
 * anything beyond 8 decimals
 */
export const decimalToPips = (decimal: string): string =>
  new BigNumber(decimal)
    .shiftedBy(8)
    .integerValue(BigNumber.ROUND_DOWN)
    .toFixed(0);

/**
 * Convert pips to native token quantity, taking the nunmber of decimals into account
 */
export const pipsToAssetUnits = (pips: string, decimals: number): string =>
  new BigNumber(pips)
    .shiftedBy(decimals - 8) // This is still correct when decimals < 8
    .integerValue(BigNumber.ROUND_DOWN)
    .toFixed(0);

/**
 * Convert pips to native token quantity, taking the nunmber of decimals into account
 */
export const assetUnitsToPips = (
  assetUnits: string,
  decimals: number,
): string =>
  new BigNumber(assetUnits)
    .shiftedBy(8 - decimals) // This is still correct when decimals > 8
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();

export const decimalToAssetUnits = (
  decimal: string,
  decimals: number,
): string => pipsToAssetUnits(decimalToPips(decimal), decimals);
