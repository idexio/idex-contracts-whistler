pragma solidity ^0.6.1;
pragma experimental ABIEncoderV2;

enum OrderSelfTradePrevention {
  DecreaseAndCancel,
  CancelOldest,
  CancelNewest,
  CancelBoth
}
enum OrderSide { Buy, Sell }
enum OrderTimeInForce { GTC, GTT, IOC, FOK }
enum OrderType {
  Market,
  Limit,
  LimitMaker,
  StopLoss,
  StopLossLimit,
  TakeProfit,
  TakeProfitLimit
}
enum WithdrawalType { BySymbol, ByAddress }

struct Order {
  // Signature fields
  uint128 nonce;
  address walletAddress;
  OrderType orderType;
  OrderSide side;
  OrderTimeInForce timeInForce;
  uint64 quantity;
  uint64 quoteOrderQuantity;
  uint64 limitPrice; // decimal pips * 10^8
  uint64 stopPrice; // decimal pips * 10^8
  OrderSelfTradePrevention selfTradePrevention;
  uint64 cancelAfter;
  // Augmented fields
  address baseAssetAddress;
  address quoteAssetAddress;
  uint64 totalQuantity; // pips
}

struct Trade {
  uint64 grossBaseQuantity; // pips
  uint64 grossQuoteQuantity; // pips
  uint64 netBaseQuantity; // pips
  uint64 netQuoteQuantity; // pips
  address makerFeeAssetAddress;
  address takerFeeAssetAddress;
  uint64 makerFeeQuantity; // pips
  uint64 takerFeeQuantity; // pips
  uint64 price; // decimal pips * 10^8
  OrderSide makerSide;
}

struct Withdrawal {
  WithdrawalType withdrawalType;
  uint128 nonce;
  address payable walletAddress;
  address assetAddress; // used in case symbol not specified
  uint64 quantity; // pips
  uint64 gasFee; // pips
  bool autoDispatchEnabled; // ignored, auto dispatch is always enabled
}


interface ICustodian {
  receive() external payable;

  function withdraw(
    address payable wallet,
    address asset,
    uint256 quantity
  ) external;

  function getExchange() external returns (address);

  function setExchange(address exchange) external;

  function getGovernance() external returns (address);

  function setGovernance(address governance) external;
}


interface IExchange {
  function executeTrade(
    Order calldata buy,
    string calldata buyBaseSymbol,
    string calldata buyQuoteSymbol,
    string calldata buyClientOrderId,
    bytes calldata buyWalletSignature,
    Order calldata sell,
    string calldata sellBaseSymbol,
    string calldata sellQuoteSymbol,
    string calldata sellClientOrderId,
    bytes calldata sellWalletSignature,
    Trade calldata trade
  ) external;

  function withdraw(
    Withdrawal calldata withdrawal,
    string calldata withdrawalTokenSymbol,
    bytes calldata withdrawalWalletSignature
  ) external;
}
