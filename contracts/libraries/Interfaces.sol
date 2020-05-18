// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;


// TODO These enums need to be wrapped in a contract so Slither can parse it
// https://github.com/crytic/slither/issues/487
contract Enums {
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
}


// TODO These structs need to be wrapped in a contract so Slither can parse it
// https://github.com/crytic/slither/issues/487
contract Structs {
  struct Order {
    // Signature fields
    uint128 nonce;
    address walletAddress;
    Enums.OrderType orderType;
    Enums.OrderSide side;
    Enums.OrderTimeInForce timeInForce;
    uint64 quantity;
    uint64 quoteOrderQuantity;
    uint64 limitPrice; // decimal pips * 10^8
    uint64 stopPrice; // decimal pips * 10^8
    Enums.OrderSelfTradePrevention selfTradePrevention;
    uint64 cancelAfter;
  }

  struct Trade {
    address baseAssetAddress;
    address quoteAssetAddress;
    uint64 grossBaseQuantity; // pips
    uint64 grossQuoteQuantity; // pips
    uint64 netBaseQuantity; // pips
    uint64 netQuoteQuantity; // pips
    address makerFeeAssetAddress;
    address takerFeeAssetAddress;
    uint64 makerFeeQuantity; // pips
    uint64 takerFeeQuantity; // pips
    uint64 price; // decimal pips * 10^8
    Enums.OrderSide makerSide;
  }

  struct Withdrawal {
    Enums.WithdrawalType withdrawalType;
    uint128 nonce;
    address payable walletAddress;
    address assetAddress; // used in case symbol not specified
    uint64 quantity; // pips
    uint64 gasFee; // pips
    bool autoDispatchEnabled; // ignored, auto dispatch is always enabled
  }
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
    string calldata baseSymbol,
    string calldata quoteSymbol,
    Structs.Order calldata buy,
    string calldata buyClientOrderId,
    bytes calldata buyWalletSignature,
    Structs.Order calldata sell,
    string calldata sellClientOrderId,
    bytes calldata sellWalletSignature,
    Structs.Trade calldata trade
  ) external;

  function withdraw(
    Structs.Withdrawal calldata withdrawal,
    string calldata withdrawalTokenSymbol,
    bytes calldata withdrawalWalletSignature
  ) external;
}
