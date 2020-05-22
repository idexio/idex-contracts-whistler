// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;


contract Enums {
  enum OrderSelfTradePrevention {
    dc, // Decrement and cancel
    co, // Cancel oldest
    cn, // Cancel newest
    cb // Cancel both
  }
  enum OrderSide { Buy, Sell }
  enum OrderTimeInForce {
    gtc, // Good until cancelled
    gtt, // Good until time
    ioc, // Immediate or cancel
    fok // Fill or kill
  }
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
    uint64 quantityInPips;
    uint64 quoteOrderQuantityInPips;
    uint64 limitPriceInPips; // decimal pips * 10^8
    uint64 stopPriceInPips; // decimal pips * 10^8
    string clientOrderId;
    Enums.OrderTimeInForce timeInForce;
    Enums.OrderSelfTradePrevention selfTradePrevention;
    uint64 cancelAfter;
    // The ECDSA signature of the buy order hash as produced by Signatures.getOrderWalletHash
    bytes walletSignature;
  }

  /**
   * @dev Return type for `Exchange.getTokenForSymbol`, also used internally by AssetRegistry
   */
  struct Asset {
    bool exists;
    address assetAddress;
    string symbol;
    uint8 decimals;
    bool isConfirmed;
    uint64 confirmedTimestampInMs; // ms since Unix epoch
  }

  /**
   * @dev Argument type for `Exchange.executeTrade`
   */
  struct Trade {
    string baseAssetSymbol;
    string quoteAssetSymbol;
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
    string assetSymbol;
    address assetAddress; // Used when assetSymbol not specified
    uint64 quantityInPips;
    uint64 gasFeeInPips;
    bool autoDispatchEnabled; // Not currently used but reserved for future use. Must be true
    bytes walletSignature;
  }
}


interface ICustodian {
  receive() external payable;

  function withdraw(
    address payable wallet,
    address asset,
    uint256 quantityInAssetUnits
  ) external;

  function getExchange() external view returns (address);

  function setExchange(address exchange) external;

  function getGovernance() external view returns (address);

  function setGovernance(address governance) external;
}


interface IExchange {
  function executeTrade(
    Structs.Order calldata buy,
    Structs.Order calldata sell,
    Structs.Trade calldata trade
  ) external;

  function withdraw(Structs.Withdrawal calldata withdrawal) external;
}
