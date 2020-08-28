import fs from 'fs';
import path from 'path';
import * as utils from './utils';
import { ExchangeInstance } from '../types/truffle-contracts/Exchange';
import { Order, Trade, Withdrawal, WithdrawalType } from './types';

/** The fixed number of digits following the decimal in quantities expressed as pips */
export const pipsDecimals = 8;

export const ethAddress = '0x0000000000000000000000000000000000000000';

export const getOrderHash = (order: Order): string =>
  utils.solidityHash([
    ['uint8', order.signatureHashVersion], // Signature hash version - only version 1 supported
    ['uint128', utils.uuidToUint8Array(order.nonce)],
    ['address', order.wallet],
    ['string', order.market],
    ['uint8', order.type],
    ['uint8', order.side],
    ['string', order.quantity || ''],
    ['string', order.quoteOrderQuantity || ''],
    ['string', order.price || ''],
    ['string', order.stopPrice || ''],
    ['string', order.clientOrderId || ''],
    ['uint8', order.timeInForce || 0],
    ['uint8', order.selfTradePrevention || 0],
    ['uint64', order.cancelAfter || 0],
  ]);

export const getWithdrawalHash = (withdrawal: Withdrawal): string => {
  if (
    (withdrawal.asset && withdrawal.assetContractAddress) ||
    (!withdrawal.asset && !withdrawal.assetContractAddress)
  ) {
    throw new Error(
      'Withdrawal must specify exactly one of asset or assetContractAddress',
    );
  }

  return utils.solidityHash([
    ['uint128', utils.uuidToUint8Array(withdrawal.nonce)],
    ['address', withdrawal.wallet],
    withdrawal.asset
      ? ['string', withdrawal.asset]
      : ['address', withdrawal.assetContractAddress as string],
    ['string', withdrawal.quantity],
    ['bool', true], // autoDispatchEnabled
  ]);
};

export const getTradeArguments = (
  buyOrder: Order,
  buyWalletSignature: string,
  sellOrder: Order,
  sellWalletSignature: string,
  trade: Trade,
): ExchangeInstance['executeTrade']['arguments'] => {
  const orderToArgumentStruct = (
    o: Order,
    walletSignature: string,
  ): ExchangeInstance['executeTrade']['arguments'][0] => {
    return {
      signatureHashVersion: o.signatureHashVersion,
      nonce: utils.uuidToHexString(o.nonce),
      walletAddress: o.wallet,
      orderType: o.type,
      side: o.side,
      quantityInPips: utils.decimalToPips(o.quantity || '0'),
      quoteOrderQuantityInPips: utils.decimalToPips(
        o.quoteOrderQuantity || '0',
      ),
      limitPriceInPips: utils.decimalToPips(o.price || '0'),
      stopPriceInPips: utils.decimalToPips(o.stopPrice || '0'),
      clientOrderId: o.clientOrderId || '',
      timeInForce: o.timeInForce || 0,
      selfTradePrevention: o.selfTradePrevention || 0,
      cancelAfter: o.cancelAfter || 0,
      walletSignature,
    };
  };
  const tradeToArgumentStruct = (
    t: Trade,
  ): ExchangeInstance['executeTrade']['arguments'][2] => {
    return {
      baseAssetSymbol: buyOrder.market.split('-')[0],
      quoteAssetSymbol: buyOrder.market.split('-')[1],
      baseAssetAddress: t.baseAssetAddress,
      quoteAssetAddress: t.quoteAssetAddress,
      grossBaseQuantityInPips: utils.decimalToPips(t.grossBaseQuantity),
      grossQuoteQuantityInPips: utils.decimalToPips(t.grossQuoteQuantity),
      netBaseQuantityInPips: utils.decimalToPips(t.netBaseQuantity),
      netQuoteQuantityInPips: utils.decimalToPips(t.netQuoteQuantity),
      makerFeeAssetAddress: t.makerFeeAssetAddress,
      takerFeeAssetAddress: t.takerFeeAssetAddress,
      makerFeeQuantityInPips: utils.decimalToPips(t.makerFeeQuantity),
      takerFeeQuantityInPips: utils.decimalToPips(t.takerFeeQuantity),
      priceInPips: utils.decimalToPips(t.price),
      makerSide: t.makerSide,
    };
  };
  return [
    orderToArgumentStruct(buyOrder, buyWalletSignature),
    orderToArgumentStruct(sellOrder, sellWalletSignature),
    tradeToArgumentStruct(trade),
  ] as const;
};

export const getWithdrawArguments = (
  withdrawal: Withdrawal,
  gasFee: string,
  walletSignature: string,
): ExchangeInstance['withdraw']['arguments'] => {
  return [
    {
      withdrawalType: withdrawal.asset
        ? WithdrawalType.BySymbol
        : WithdrawalType.ByAddress,
      nonce: utils.uuidToHexString(withdrawal.nonce),
      walletAddress: withdrawal.wallet,
      assetSymbol: withdrawal.asset || '',
      assetAddress: withdrawal.assetContractAddress || ethAddress,
      quantityInPips: utils.decimalToPips(withdrawal.quantity),
      gasFeeInPips: utils.decimalToPips(gasFee),
      autoDispatchEnabled: true,
      walletSignature,
    },
  ];
};

export type LoadContractResult = {
  abi: any[];
  bytecode: string;
};

export const loadCustodianContract = (): LoadContractResult =>
  loadContract('Custodian');

export const loadExchangeContract = (): LoadContractResult =>
  loadContract('Exchange');

export const loadGovernanceContract = (): LoadContractResult =>
  loadContract('Governance');

const _compiledContractMap = new Map<string, LoadContractResult>();
const loadContract = (
  filename: 'Custodian' | 'Exchange' | 'Governance',
): LoadContractResult => {
  if (!_compiledContractMap.has(filename)) {
    const { abi, bytecode } = JSON.parse(
      fs
        .readFileSync(
          path.join(__dirname, '..', 'contracts', `${filename}.json`),
        )
        .toString('utf8'),
    );
    _compiledContractMap.set(filename, { abi, bytecode });
  }

  return _compiledContractMap.get(filename) as LoadContractResult; // Will never be undefined as it gets set above
};
