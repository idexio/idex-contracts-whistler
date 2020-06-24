// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.8;
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
   * @dev Return type for `Exchange.loadAssetBySymbol`, and `Exchange.loadAssetByAddress`; also
   * used internally by `AssetRegistry`
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


/**
 * @dev Interface of the ERC20 standard as defined in the EIP, but with no return values for
 * transfer and transferFrom. By asserting expected balance changes when calling these two methods
 * we can safely ignore their return values. This allows support of non-compliant tokens that do not
 * return a boolean. See https://github.com/ethereum/solidity/issues/4116
 */
interface IERC20 {
  /**
   * @dev Returns the amount of tokens in existence.
   */
  function totalSupply() external view returns (uint256);

  /**
   * @dev Returns the amount of tokens owned by `account`.
   */
  function balanceOf(address account) external view returns (uint256);

  /**
   * @dev Moves `amount` tokens from the caller's account to `recipient`.
   *
   * Most implementing contracts return a boolean value indicating whether the operation succeeded, but
   * we ignore this and rely on asserting balance changes instead
   *
   * Emits a {Transfer} event.
   */
  function transfer(address recipient, uint256 amount) external;

  /**
   * @dev Returns the remaining number of tokens that `spender` will be
   * allowed to spend on behalf of `owner` through {transferFrom}. This is
   * zero by default.
   *
   * This value changes when {approve} or {transferFrom} are called.
   */
  function allowance(address owner, address spender)
    external
    view
    returns (uint256);

  /**
   * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * IMPORTANT: Beware that changing an allowance with this method brings the risk
   * that someone may use both the old and the new allowance by unfortunate
   * transaction ordering. One possible solution to mitigate this race
   * condition is to first reduce the spender's allowance to 0 and set the
   * desired value afterwards:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   *
   * Emits an {Approval} event.
   */
  function approve(address spender, uint256 amount) external returns (bool);

  /**
   * @dev Moves `amount` tokens from `sender` to `recipient` using the
   * allowance mechanism. `amount` is then deducted from the caller's
   * allowance.
   *
   * Most implementing contracts return a boolean value indicating whether the operation succeeded, but
   * we ignore this and rely on asserting balance changes instead
   *
   * Emits a {Transfer} event.
   */
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external;

  /**
   * @dev Emitted when `value` tokens are moved from one account (`from`) to
   * another (`to`).
   *
   * Note that `value` may be zero.
   */
  event Transfer(address indexed from, address indexed to, uint256 value);

  /**
   * @dev Emitted when the allowance of a `spender` for an `owner` is set by
   * a call to {approve}. `value` is the new allowance.
   */
  event Approval(address indexed owner, address indexed spender, uint256 value);
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
