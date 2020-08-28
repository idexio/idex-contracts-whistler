export enum OrderSelfTradePrevention {
  DecreaseAndCancel,
  CancelOldest,
  CancelNewest,
  CancelBoth,
}

export enum OrderSide {
  Buy,
  Sell,
}

export enum OrderTimeInForce {
  GTC,
  GTT,
  IOC,
  FOK,
}

export enum OrderType {
  Market,
  Limit,
  LimitMaker,
  StopLoss,
  StopLossLimit,
  TakeProfit,
  TakeProfitLimit,
}

export interface Order {
  signatureHashVersion: number;
  nonce: string;
  wallet: string;
  market: string;
  type: OrderType;
  side: OrderSide;
  timeInForce?: OrderTimeInForce;
  quantity?: string;
  quoteOrderQuantity?: string;
  price: string;
  stopPrice?: string;
  clientOrderId?: string;
  selfTradePrevention?: OrderSelfTradePrevention;
  cancelAfter?: number;
}

export interface Trade {
  baseAssetAddress: string;
  quoteAssetAddress: string;
  grossBaseQuantity: string;
  grossQuoteQuantity: string;
  netBaseQuantity: string;
  netQuoteQuantity: string;
  makerFeeAssetAddress: string;
  takerFeeAssetAddress: string;
  makerFeeQuantity: string;
  takerFeeQuantity: string;
  price: string;
  makerSide: OrderSide;
}

export enum WithdrawalType {
  BySymbol,
  ByAddress,
}

export interface Withdrawal {
  nonce: string;
  wallet: string;
  quantity: string; // Decimal string
  autoDispatchEnabled: boolean; // Currently has no effect
  asset?: string;
  assetContractAddress?: string;
}
