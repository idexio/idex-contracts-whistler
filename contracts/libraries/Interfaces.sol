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
  /**
   * @dev Argument type for `Exchange.executeTrade` and `Signatures.getOrderWalletHash`
   */
  struct Order {
    uint8 signatureHashVersion;
    uint128 nonce;
    address walletAddress;
    Enums.OrderType orderType;
    Enums.OrderSide side;
    Enums.OrderTimeInForce timeInForce;
    uint64 quantityInPips;
    uint64 quoteOrderQuantityInPips;
    uint64 limitPriceInPips; // decimal pips * 10^8
    uint64 stopPriceInPips; // decimal pips * 10^8
    Enums.OrderSelfTradePrevention selfTradePrevention;
    uint64 cancelAfter;
  }

  /**
   * @dev Return type for `Exchange.getTokenForSymbol`
   */
  struct Token {
    bool exists;
    address tokenAddress;
    string symbol;
    uint8 decimals;
    bool isConfirmed;
    uint64 confirmedAt; // ms since Unix epoch
  }

  /**
   * @dev Argument type for `Exchange.executeTrade`
   */
  struct Trade {
    address baseAssetAddress;
    address quoteAssetAddress;
    uint64 grossBaseQuantityInPips;
    uint64 grossQuoteQuantityInPips;
    uint64 netBaseQuantityInPips;
    uint64 netQuoteQuantityInPips;
    address makerFeeAssetAddress;
    address takerFeeAssetAddress;
    uint64 makerFeeQuantityInPips;
    uint64 takerFeeQuantityInPips;
    uint64 priceInPips; // decimal pips * 10^8
    Enums.OrderSide makerSide;
  }

  /**
   * @dev Argument type for `Exchange.withdraw` and `Signatures.getWithdrawalWalletHash`
   */
  struct Withdrawal {
    Enums.WithdrawalType withdrawalType;
    uint128 nonce;
    address payable walletAddress;
    address assetAddress; // used in case symbol not specified
    uint64 quantityInPips;
    uint64 gasFeeInPips;
    bool autoDispatchEnabled; // ignored, auto dispatch is always enabled
  }
}


interface ICustodian {
  receive() external payable;

  function withdraw(
    address payable wallet,
    address asset,
    uint256 tokenQuantity
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
