pragma solidity ^0.6.5;
pragma experimental ABIEncoderV2;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';

import { ECRecovery } from './libraries/ECRecovery.sol';
import { ICustodian } from './libraries/Interfaces.sol';
import { Owned } from './Owned.sol';
import { SafeMath64 } from './libraries/SafeMath64.sol';
import { Tokens } from './libraries/Tokens.sol';
import { Transfers } from './libraries/Transfers.sol';


contract Exchange is Owned {
  using SafeMath64 for uint64;
  using SafeMath256 for uint256;
  using Tokens for Tokens.Storage;

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

  /* Events */

  event ChainPropagationDelayChanged(uint256 previousValue, uint256 newValue);
  event Deposited(
    address indexed wallet,
    address indexed asset,
    uint64 quantityInPips,
    uint64 index
  );
  event DispatcherChanged(address previousValue, address newValue);
  event FeeWalletChanged(address previousValue, address newValue);
  event InvalidatedOrderNonce(
    address indexed wallet,
    uint128 nonce,
    uint128 timestamp,
    uint256 effectiveBlockNumber
  );
  event RegisteredToken(
    address indexed tokenAddress,
    string symbol,
    uint8 decimals
  );
  event ConfirmedRegisteredToken(
    address indexed tokenAddress,
    string symbol,
    uint8 decimals
  );
  event ExecutedTrade(
    address indexed buyWallet,
    address indexed sellWallet,
    string baseSymbol,
    string quoteSymbol,
    uint64 baseQuantity,
    uint64 quoteQuantity,
    uint64 tradePrice
  );
  event TradeMakerFeeChanged(uint64 previousValue, uint64 newValue);
  event TradeTakerFeeChanged(uint64 previousValue, uint64 newValue);
  event WalletExited(address indexed wallet, uint256 effectiveBlockNumber);
  event WalletExitWithdrawn(
    address indexed wallet,
    address asset,
    uint256 quantity
  );
  event Withdrawn(address indexed wallet, address asset, uint256 quantity);
  event WithdrawalFeeChanged(uint64 previousValue, uint64 newValue);

  /* Structs */

  struct NonceInvalidation {
    bool exists;
    uint64 timestamp;
    uint256 effectiveBlockNumber;
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
  struct WalletExit {
    bool exists;
    uint256 effectiveBlockNumber;
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

  /* Storage */

  // Mapping of order hash => isComplete
  mapping(bytes32 => bool) completedOrderHashes;
  // Mapping of order hash => isComplete
  mapping(bytes32 => bool) completedWithdrawalHashes;
  address payable custodian;
  uint64 depositIndex;
  // Mapping of wallet => asset => balance
  mapping(address => mapping(address => uint256)) balances;
  // Mapping of wallet => last invalidated timestamp
  mapping(address => NonceInvalidation) nonceInvalidations;
  // Mapping of order hash => filled quantity in pips
  mapping(bytes32 => uint64) partiallyFilledOrderQuantities;
  Tokens.Storage internal tokens;
  mapping(address => WalletExit) walletExits;
  // Tunable parameters
  uint256 chainPropagationDelay;
  address dispatcher;
  address feeWallet;
  uint64 tradeMakerFeeBasisPoints;
  uint64 tradeTakerFeeBasisPoints;
  uint64 withdrawalFeeBasisPoints;
  // Guards on tunable parameters
  uint256 immutable maxChainPropagationDelay;
  uint64 immutable maxTradeFeeBasisPoints;
  uint64 immutable maxWithdrawalFeeBasisPoints;

  constructor() public Owned() {
    maxChainPropagationDelay = (7 * 24 * 60 * 60) / 15; // 1 week at 15s/block
    maxWithdrawalFeeBasisPoints = 10 * 100; // 10%
    maxTradeFeeBasisPoints = 10 * 100; // 10%
  }

  function setCustodian(address payable _custodian) external onlyAdmin {
    require(_custodian != address(0x0), 'Invalid address');
    require(custodian == address(0x0), 'Custodian can only be set once');
    custodian = _custodian;
  }

  /*** Tunable parameters ***/

  function setChainPropagationDelay(uint256 _chainPropagationDelay)
    external
    onlyAdmin
  {
    require(
      _chainPropagationDelay < maxChainPropagationDelay,
      'Must be less than 1 week'
    );
    emit ChainPropagationDelayChanged(
      chainPropagationDelay,
      _chainPropagationDelay
    );
    chainPropagationDelay = _chainPropagationDelay;
  }

  function setFeeWallet(address _feeWallet) external onlyAdmin {
    require(_feeWallet != address(0x0), 'Invalid wallet address');
    require(
      _feeWallet != feeWallet,
      'Must be different from current fee wallet'
    );
    emit FeeWalletChanged(feeWallet, _feeWallet);
    feeWallet = _feeWallet;
  }

  function setWithdrawalFeeBasisPoints(uint64 _withdrawalFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      _withdrawalFeeBasisPoints < maxWithdrawalFeeBasisPoints,
      'Excessive withdrawal fee'
    );
    emit WithdrawalFeeChanged(
      withdrawalFeeBasisPoints,
      _withdrawalFeeBasisPoints
    );
    withdrawalFeeBasisPoints = _withdrawalFeeBasisPoints;
  }

  function setTradeMakerFeeBasisPoints(uint64 _tradeMakerFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      _tradeMakerFeeBasisPoints < maxTradeFeeBasisPoints,
      'Excessive maker fee'
    );
    emit TradeMakerFeeChanged(
      tradeMakerFeeBasisPoints,
      _tradeMakerFeeBasisPoints
    );
    tradeMakerFeeBasisPoints = _tradeMakerFeeBasisPoints;
  }

  function setTradeTakerFeeBasisPoints(uint64 _tradeTakerFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      _tradeTakerFeeBasisPoints < maxTradeFeeBasisPoints,
      'Excessive taker fee'
    );
    emit TradeTakerFeeChanged(
      tradeTakerFeeBasisPoints,
      _tradeTakerFeeBasisPoints
    );
    tradeTakerFeeBasisPoints = _tradeTakerFeeBasisPoints;
  }

  /*** Accessors ***/

  function balanceOf(address wallet, address asset)
    external
    view
    returns (uint256 balance)
  {
    return balances[wallet][asset];
  }

  /**
   * Only partially filled orders will return a non-zero value, filled orders will return 0.
   * Invalidating an order nonce will not clear partial fill quantities for earlier orders
   * because the gas cost for this is potentially unbound
   */
  function partiallyFilledOrderQuantity(bytes32 orderHash)
    external
    view
    returns (uint64 quantity)
  {
    return partiallyFilledOrderQuantities[orderHash];
  }

  /*** Depositing ***/

  function depositEther() external payable {
    deposit(msg.sender, address(0x0), msg.value);
  }

  /**
   * Before a token other than ETH can be deposited, the sending wallet must call
   * the approve method on the token contract for at least the deposit quantity
   */
  function depositToken(address tokenAddress, uint256 quantity) external {
    require(tokenAddress != address(0x0), 'Use depositEther to deposit Ether');
    deposit(msg.sender, tokenAddress, quantity);
  }

  function depositTokenBySymbol(string calldata tokenSymbol, uint256 quantity)
    external
  {
    address tokenAddress = tokens.tokenSymbolToAddress(
      tokenSymbol,
      uint64(block.timestamp * 1000)
    );
    require(tokenAddress != address(0x0), 'Use depositEther to deposit Ether');
    deposit(msg.sender, tokenAddress, quantity);
  }

  function deposit(
    address payable wallet,
    address asset,
    uint256 quantity
  ) private {
    require(!walletExits[wallet].exists, 'Wallet exited');

    // If asset is a token, it must be registered
    if (asset != address(0x0)) {
      Tokens.Token storage token = tokens.tokensByAddress[asset];
      require(
        token.exists && token.isConfirmed,
        'Token registration not confirmed'
      );
    }
    uint64 quantityInPips = tokens.transferFromWallet(wallet, asset, quantity);

    // Any fractional amount in the deposited quantity that is too small to express in pips
    // accumulates as dust in the Exchange contract
    uint256 tokenQuantityInPipPrecision = tokens.pipsToTokenQuantity(
      quantityInPips,
      asset
    );
    uint256 newBalance = balances[wallet][asset].add(
      tokenQuantityInPipPrecision
    );
    balances[wallet][asset] = newBalance;
    Transfers.transferTo(custodian, asset, tokenQuantityInPipPrecision);

    depositIndex++;
    emit Deposited(wallet, asset, quantityInPips, depositIndex);
  }

  /*** Invalidation ***/

  function invalidateOrderNonce(uint128 nonce) external {
    uint64 timestamp = getTimestampFromUuid(nonce);

    if (nonceInvalidations[msg.sender].exists) {
      require(
        nonceInvalidations[msg.sender].timestamp < timestamp,
        'Nonce timestamp already invalidated'
      );
      require(
        nonceInvalidations[msg.sender].effectiveBlockNumber <= block.number,
        'Previous invalidation awaiting chain propagation'
      );
    }

    nonceInvalidations[msg.sender] = NonceInvalidation(
      true,
      timestamp,
      block.number + chainPropagationDelay
    );

    emit InvalidatedOrderNonce(
      msg.sender,
      nonce,
      timestamp,
      block.number + chainPropagationDelay
    );
  }

  /*** Withdrawing ***/

  function withdraw(
    Withdrawal memory withdrawal,
    string memory withdrawalTokenSymbol,
    bytes memory withdrawalWalletSignature
  ) public onlyDispatcher {
    // Validations
    require(!walletExits[withdrawal.walletAddress].exists, 'Wallet exited');
    require(
      getFeeBasisPoints(withdrawal.gasFee, withdrawal.quantity) <=
        withdrawalFeeBasisPoints,
      'Excessive withdrawal fee'
    );
    bytes32 withdrawalHash = validateWithdrawalSignature(
      withdrawal,
      withdrawalTokenSymbol,
      withdrawalWalletSignature
    );
    require(!completedWithdrawalHashes[withdrawalHash], 'Hash already withdrawn');

    // If withdrawal is by asset symbol (most common) then resolve to asset address
    address assetAddress = withdrawal.withdrawalType == WithdrawalType.BySymbol
      ? tokens.tokenSymbolToAddress(
        withdrawalTokenSymbol,
        getTimestampFromUuid(withdrawal.nonce)
      )
      : withdrawal.assetAddress;

    // SafeMath reverts if overdrawn
    uint256 quantityInWei = tokens.pipsToTokenQuantity(
      withdrawal.quantity,
      assetAddress
    );
    balances[withdrawal.walletAddress][assetAddress] = balances[withdrawal
      .walletAddress][assetAddress]
      .sub(quantityInWei);
    balances[feeWallet][withdrawal
      .assetAddress] = balances[feeWallet][assetAddress].add(
      tokens.pipsToTokenQuantity(withdrawal.gasFee, assetAddress)
    );

    ICustodian(custodian).withdraw(
      withdrawal.walletAddress,
      assetAddress,
      tokens.pipsToTokenQuantity(
        withdrawal.quantity.sub(withdrawal.gasFee),
        assetAddress
      )
    );

    completedWithdrawalHashes[withdrawalHash] = true;

    emit Withdrawn(withdrawal.walletAddress, assetAddress, quantityInWei);
  }

  /*** Wallet exits ***/

  function exitWallet() external {
    require(!walletExits[msg.sender].exists, 'Wallet already exited');

    walletExits[msg.sender] = WalletExit(
      true,
      block.number + chainPropagationDelay
    );

    emit WalletExited(msg.sender, block.number + chainPropagationDelay);
  }

  function withdrawExit(address assetAddress) external {
    require(walletExits[msg.sender].exists, 'Wallet not yet exited');
    require(
      walletExits[msg.sender].effectiveBlockNumber <= block.number,
      'Wallet exit block delay not yet elapsed'
    );

    uint256 balance = balances[msg.sender][assetAddress];
    require(balance > 0, 'No balance for asset');
    balances[msg.sender][assetAddress] = 0;

    ICustodian(custodian).withdraw(msg.sender, assetAddress, balance);

    emit WalletExitWithdrawn(msg.sender, assetAddress, balance);
  }

  /*** Trades ***/

  function executeTrade(
    Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    string memory buyClientOrderId,
    bytes memory buyWalletSignature,
    Order memory sell,
    string memory sellBaseSymbol,
    string memory sellQuoteSymbol,
    string memory sellClientOrderId,
    bytes memory sellWalletSignature,
    Trade memory trade
  ) public onlyDispatcher {
    require(!walletExits[buy.walletAddress].exists, 'Buy wallet exited');
    require(!walletExits[sell.walletAddress].exists, 'Sell wallet exited');

    // TODO Validate max fee amounts
    validateAssetPair(
      buy,
      buyBaseSymbol,
      buyQuoteSymbol,
      sell,
      sellBaseSymbol,
      sellQuoteSymbol,
      trade
    );
    validateLimitPrices(buy, sell, trade);
    validateOrderNonces(buy, sell);
    (bytes32 buyHash, bytes32 sellHash) = validateOrderSignatures(
      buy,
      buyBaseSymbol,
      buyQuoteSymbol,
      buyClientOrderId,
      buyWalletSignature,
      sell,
      sellBaseSymbol,
      sellQuoteSymbol,
      sellClientOrderId,
      sellWalletSignature
    );
    validateTradeFees(buy, trade);

    updateOrderFilledQuantities(buy, buyHash, sell, sellHash, trade);
    updateBalancesForTrade(buy, sell, trade);

    emit ExecutedTrade(
      buy.walletAddress,
      sell.walletAddress,
      buyBaseSymbol,
      buyQuoteSymbol,
      trade.grossBaseQuantity,
      trade.grossQuoteQuantity,
      trade.price
    );
  }

  /*
   * Updates buyer, seller, and fee wallet balances for both assets in trade pair according to fill parameters
   */
  function updateBalancesForTrade(
    Order memory buy,
    Order memory sell,
    Trade memory trade
  ) private {
    // Buyer receives base asset minus fees
    balances[buy.walletAddress][buy.baseAssetAddress] = balances[buy
      .walletAddress][buy.baseAssetAddress]
      .add(
      tokens.pipsToTokenQuantity(trade.netBaseQuantity, buy.baseAssetAddress)
    );
    // Buyer gives quote asset including fees
    balances[buy.walletAddress][buy.quoteAssetAddress] = balances[buy
      .walletAddress][buy.quoteAssetAddress]
      .sub(
      tokens.pipsToTokenQuantity(
        trade.grossQuoteQuantity,
        buy.quoteAssetAddress
      )
    );

    // Seller gives base asset including fees
    balances[sell.walletAddress][sell.baseAssetAddress] = balances[sell
      .walletAddress][sell.baseAssetAddress]
      .sub(
      tokens.pipsToTokenQuantity(
        trade.grossBaseQuantity,
        sell.baseAssetAddress
      )
    );
    // Seller receives quote asset minus fees
    balances[sell.walletAddress][sell.quoteAssetAddress] = balances[sell
      .walletAddress][sell.quoteAssetAddress]
      .add(
      tokens.pipsToTokenQuantity(
        trade.netQuoteQuantity,
        sell.quoteAssetAddress
      )
    );

    // Maker and taker fees to fee wallet
    balances[feeWallet][trade
      .makerFeeAssetAddress] = balances[feeWallet][trade.makerFeeAssetAddress]
      .add(
      tokens.pipsToTokenQuantity(
        trade.makerFeeQuantity,
        trade.makerFeeAssetAddress
      )
    );
    balances[feeWallet][trade
      .takerFeeAssetAddress] = balances[feeWallet][trade.takerFeeAssetAddress]
      .add(
      tokens.pipsToTokenQuantity(
        trade.takerFeeQuantity,
        trade.takerFeeAssetAddress
      )
    );
  }

  function updateOrderFilledQuantities(
    Order memory buyOrder,
    bytes32 buyOrderHash,
    Order memory sellOrder,
    bytes32 sellOrderHash,
    Trade memory trade
  ) private {
    updateOrderFilledQuantity(buyOrder, buyOrderHash, trade);
    updateOrderFilledQuantity(sellOrder, sellOrderHash, trade);
  }

  /*
   * Update filled quantities tracking for order to prevent over- or double-filling orders
   */
  function updateOrderFilledQuantity(Order memory order, bytes32 orderHash, Trade memory trade)
    private
  {
    require(!completedOrderHashes[orderHash], 'Order double filled');

    uint64 newFilledQuantity = trade.grossBaseQuantity.add(
      partiallyFilledOrderQuantities[orderHash]
    );
    require(newFilledQuantity <= order.totalQuantity, 'Order overfilled');

    if (newFilledQuantity < order.totalQuantity) {
      partiallyFilledOrderQuantities[orderHash] = newFilledQuantity;
    } else {
      delete partiallyFilledOrderQuantities[orderHash];
      completedOrderHashes[orderHash] = true;
    }
  }

  /*** Validations ***/

  function validateAssetPair(
    Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    Order memory sell,
    string memory sellBaseSymbol,
    string memory sellQuoteSymbol,
    Trade memory trade
  ) private view {
    validateTokenAddresses(buy, buyBaseSymbol, buyQuoteSymbol);
    validateTokenAddresses(
      sell,
      sellBaseSymbol,
      sellQuoteSymbol
    );

    // Both orders must be for same asset pair
    require(
      buy.baseAssetAddress == sell.baseAssetAddress,
      'Base asset mismatch'
    );
    require(
      buy.quoteAssetAddress == sell.quoteAssetAddress,
      'Quote asset mismatch'
    );

    // Same pair for both orders validated, so just need to check for mismatch in one
    require(
      buy.baseAssetAddress != buy.quoteAssetAddress,
      'Base and quote assets must be different'
    );

    // Fee asset validation
    require(
      trade.makerFeeAssetAddress == buy.baseAssetAddress ||
        trade.makerFeeAssetAddress == buy.quoteAssetAddress,
      'Maker fee asset is not in trade pair'
    );
    require(
      trade.takerFeeAssetAddress == buy.baseAssetAddress ||
        trade.takerFeeAssetAddress == buy.quoteAssetAddress,
      'Taker fee asset is not in trade pair'
    );
    require(
      trade.makerFeeAssetAddress != trade.takerFeeAssetAddress,
      'Maker and taker fee assets must be different'
    );
  }

  function validateLimitPrices(
    Order memory buy,
    Order memory sell,
    Trade memory trade
  ) private pure {
    require(
      trade.grossBaseQuantity > 0,
      'Base amount must be greater than zero'
    );
    require(
      trade.grossQuoteQuantity > 0,
      'Quote amount must be greater than zero'
    );
    uint64 price = trade.grossQuoteQuantity.mul(10**8).div(
      trade.grossBaseQuantity
    );

    bool exceedsBuyLimit = buy.orderType == OrderType.Limit &&
      price > buy.limitPrice;
    require(!exceedsBuyLimit, 'Buy order limit price exceeded');

    bool exceedsSellLimit = sell.orderType == OrderType.Limit &&
      price < sell.limitPrice;
    require(!exceedsSellLimit, 'Sell order limit price exceeded');
  }

  function validateTokenAddresses(
    Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol
  ) private view {
    uint64 timestamp = getTimestampFromUuid(order.nonce);
    address baseAssetAddress = tokens.tokenSymbolToAddress(
      baseSymbol,
      timestamp
    );
    address quoteAssetAddress = tokens.tokenSymbolToAddress(
      quoteSymbol,
      timestamp
    );

    require(
      baseAssetAddress == order.baseAssetAddress &&
        quoteAssetAddress == order.quoteAssetAddress,
      order.side == OrderSide.Buy
        ? 'Buy order market symbol address resolution mismatch'
        : 'Sell order market symbol address resolution mismatch'
    );
    require(
      baseAssetAddress == address(0x0) ||
        tokens.tokensByAddress[baseAssetAddress].isConfirmed,
      order.side == OrderSide.Buy
        ? 'Buy order base asset registration not confirmed'
        : 'Sell order base asset registration not confirmed'
    );
    require(
      quoteAssetAddress == address(0x0) ||
        tokens.tokensByAddress[quoteAssetAddress].isConfirmed,
      order.side == OrderSide.Buy
        ? 'Buy order quote asset registration not confirmed'
        : 'Sell order quote asset registration not confirmed'
    );
  }

  function validateTradeFees(Order memory order, Trade memory trade)
    private
    view
  {
    uint64 makerTotalQuantity = trade.makerFeeAssetAddress ==
      order.baseAssetAddress
      ? trade.grossBaseQuantity
      : trade.grossQuoteQuantity;
    uint64 takerTotalQuantity = trade.takerFeeAssetAddress ==
      order.baseAssetAddress
      ? trade.grossBaseQuantity
      : trade.grossQuoteQuantity;

    require(
      getFeeBasisPoints(trade.makerFeeQuantity, makerTotalQuantity) <=
        tradeMakerFeeBasisPoints,
      'Excessive maker fee'
    );
    require(
      getFeeBasisPoints(trade.takerFeeQuantity, takerTotalQuantity) <=
        tradeTakerFeeBasisPoints,
      'Excessive taker fee'
    );
  }

  function validateOrderSignatures(
    Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    string memory buyClientOrderId,
    bytes memory buyWalletSignature,
    Order memory sell,
    string memory sellBaseSymbol,
    string memory sellQuoteSymbol,
    string memory sellClientOrderId,
    bytes memory sellWalletSignature
  ) private pure returns (bytes32, bytes32) {
    bytes32 buyOrderHash = validateOrderSignature(
      buy,
      buyBaseSymbol,
      buyQuoteSymbol,
      buyClientOrderId,
      buyWalletSignature
    );
    bytes32 sellOrderHash = validateOrderSignature(
      sell,
      sellBaseSymbol,
      sellQuoteSymbol,
      sellClientOrderId,
      sellWalletSignature
    );

    return (buyOrderHash, sellOrderHash);
  }

  function validateOrderSignature(
    Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol,
    string memory clientOrderId,
    bytes memory walletSignature
  ) private pure returns (bytes32) {
    bytes32 orderHash = getOrderWalletHash(
      order,
      baseSymbol,
      quoteSymbol,
      clientOrderId
    );

    require(
      ECRecovery.isSignatureValid(
        orderHash,
        walletSignature,
        order.walletAddress
      ),
      order.side == OrderSide.Buy
        ? 
      'Invalid wallet signature for buy order':
      'Invalid wallet signature for sell order'
    );

    return orderHash;
  }

  function validateOrderNonces(Order memory buy, Order memory sell)
    private
    view
  {
    require(
      getTimestampFromUuid(buy.nonce) >
        getLastInvalidatedTimestamp(buy.walletAddress),
      'Buy order nonce timestamp too low'
    );
    require(
      getTimestampFromUuid(sell.nonce) >
        getLastInvalidatedTimestamp(sell.walletAddress),
      'Sell order nonce timestamp too low'
    );
  }

  function validateWithdrawalSignature(
    Withdrawal memory withdrawal,
    string memory withdrawalTokenSymbol,
    bytes memory withdrawalWalletSignature
  ) private pure returns (bytes32) {
    bytes32 withdrawalHash = getWithdrawalWalletHash(withdrawal, withdrawalTokenSymbol);

    require(
      ECRecovery.isSignatureValid(
        withdrawalHash,
        withdrawalWalletSignature,
        withdrawal.walletAddress
      ),
      'Invalid wallet signature'
    );

    return withdrawalHash;
  }

  /*** Wallet signature hashes ***/

  function getOrderWalletHash(
    Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol,
    string memory clientOrderId
  ) private pure returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(
          abi.encodePacked(
            order.nonce,
            order.walletAddress,
            getMarketSymbol(baseSymbol, quoteSymbol),
            uint8(order.orderType),
            uint8(order.side),
            uint8(order.timeInForce),
            // Ledger qtys and prices are in pip, but order was signed by wallet owner with decimal values
            order.quantity > 0 ? pipToDecimal(order.quantity) : ''
          ),
          abi.encodePacked(
            order.quoteOrderQuantity > 0 ? pipToDecimal(order.quoteOrderQuantity) : '',
            order.limitPrice > 0 ? pipToDecimal(order.limitPrice) : '',
            clientOrderId,
            order.stopPrice > 0 ? pipToDecimal(order.stopPrice) : '',
            uint8(order.selfTradePrevention),
            order.cancelAfter
          )
        )
      );
  }

  function getMarketSymbol(string memory baseSymbol, string memory quoteSymbol)
    private
    pure
    returns (string memory)
  {
    bytes memory baseSymbolBytes = bytes(baseSymbol);
    bytes memory hyphenBytes = bytes('-');
    bytes memory quoteSymbolBytes = bytes(quoteSymbol);

    bytes memory marketSymbolBytes = bytes(
      new string(
        baseSymbolBytes.length + quoteSymbolBytes.length + hyphenBytes.length
      )
    );

    uint256 i;
    uint256 j;

    for (i = 0; i < baseSymbolBytes.length; i++) {
      marketSymbolBytes[j++] = baseSymbolBytes[i];
    }

    for (i = 0; i < hyphenBytes.length; i++) {
      marketSymbolBytes[j++] = hyphenBytes[i];
    }

    for (i = 0; i < quoteSymbolBytes.length; i++) {
      marketSymbolBytes[j++] = quoteSymbolBytes[i];
    }

    return string(marketSymbolBytes);
  }

  function getWithdrawalWalletHash(
    Withdrawal memory withdrawal,
    string memory withdrawalTokenSymbol
  ) private pure returns (bytes32) {
    return
      keccak256(
        withdrawal.withdrawalType == WithdrawalType.BySymbol
          ? abi.encodePacked(
            withdrawal.nonce,
            withdrawal.walletAddress,
            withdrawalTokenSymbol,
            pipToDecimal(withdrawal.quantity),
            withdrawal.autoDispatchEnabled
          )
          : abi.encodePacked(
            withdrawal.nonce,
            withdrawal.walletAddress,
            withdrawal.assetAddress,
            pipToDecimal(withdrawal.quantity),
            withdrawal.autoDispatchEnabled
          )
      );
  }

  /*** Token registry ***/

  function registerToken(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    tokens.registerToken(tokenAddress, symbol, decimals);
    emit RegisteredToken(tokenAddress, symbol, decimals);
  }

  function confirmTokenRegistration(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    tokens.confirmTokenRegistration(tokenAddress, symbol, decimals);
    emit ConfirmedRegisteredToken(tokenAddress, symbol, decimals);
  }

  function tokenQuantityToPips(uint256 tokenQuantity, uint256 tokenDecimals)
    public
    pure
    returns (uint64)
  {
    return Tokens.tokenQuantityToPips(tokenQuantity, tokenDecimals);
  }

  function tokenSymbolToAddress(string memory tokenSymbol, uint64 timestamp)
    public
    view
    returns (address)
  {
    return tokens.tokenSymbolToAddress(tokenSymbol, timestamp);
  }

  function getTokenByAddress(address tokenAddress)
    external
    view
    returns (Tokens.Token memory)
  {
    return tokens.tokensByAddress[tokenAddress];
  }

  function getTokensBySymbol(string calldata tokenSymbol)
    external
    view
    returns (Tokens.Token[] memory)
  {
    return tokens.tokensBySymbol[tokenSymbol];
  }

  /*** RBAC ***/

  function setDispatcher(address _dispatcher) external onlyAdmin {
    require(_dispatcher != address(0x0), 'Invalid wallet address');
    require(
      _dispatcher != dispatcher,
      'Must be different from current dispatcher'
    );
    emit DispatcherChanged(dispatcher, _dispatcher);
    dispatcher = _dispatcher;
  }

  function removeDispatcher() external onlyAdmin {
    emit DispatcherChanged(dispatcher, address(0x0));
    dispatcher = address(0x0);
  }

  modifier onlyDispatcher() {
    require(msg.sender == dispatcher, 'Caller is not dispatcher');
    _;
  }

  /*** Utils ***/

  function isStringEqual(string memory a, string memory b)
    public
    pure
    returns (bool)
  {
    return Tokens.isStringEqual(a, b);
  }

  function pipsToTokenQuantity(uint64 quantityInPips, uint64 tokenDecimals)
    public
    pure
    returns (uint256)
  {
    return Tokens.pipsToTokenQuantity(quantityInPips, tokenDecimals);
  }

  // Inspired by https://github.com/provable-things/ethereum-api/blob/831f4123816f7a3e57ebea171a3cdcf3b528e475/oraclizeAPI_0.5.sol#L1045-L1062
  function pipToDecimal(uint256 pips) private pure returns (string memory) {
    uint256 copy = pips;
    uint256 length;
    while (copy != 0) {
      length++;
      copy /= 10;
    }
    if (length < 9) {
      length = 9; // a zero before the decimal point plus 8 decimals
    }
    length++; // for the decimal point
    bytes memory decimal = new bytes(length);
    for (uint256 i = length; i > 0; i--) {
      if (length - i == 8) {
        decimal[i - 1] = bytes1(uint8(46)); // period
      } else {
        decimal[i - 1] = bytes1(uint8(48 + (pips % 10)));
        pips /= 10;
      }
    }
    return string(decimal);
  }

  function getFeeBasisPoints(uint64 fee, uint64 total)
    private
    pure
    returns (uint64)
  {
    return fee.mul(10000).div(total);
  }

  function getLastInvalidatedTimestamp(address walletAddress)
    private
    view
    returns (uint64)
  {
    if (
      nonceInvalidations[walletAddress].exists &&
      nonceInvalidations[walletAddress].effectiveBlockNumber <= block.number
    ) {
      return nonceInvalidations[walletAddress].timestamp;
    }

    return 0;
  }

  // https://tools.ietf.org/html/rfc4122#section-4.1.2
  function getTimestampFromUuid(uint128 uuid) private pure returns (uint64) {
    uint128 version = (uuid >> 76) & 0x0000000000000000000000000000000F;
    require(version == 1, 'Must be v1 UUID');

    // Time components are in reverse order so shift+mask each to reassemble
    uint128 timeHigh = (uuid >> 16) & 0x00000000000000000FFF000000000000;
    uint128 timeMid = (uuid >> 48) & 0x00000000000000000000FFFF00000000;
    uint128 timeLow = (uuid >> 96) & 0x000000000000000000000000FFFFFFFF;
    uint128 nsSinceGregorianEpoch = (timeHigh | timeMid | timeLow);
    // Gregorian offset given in seconds by https://www.wolframalpha.com/input/?i=convert+1582-10-15+UTC+to+unix+time
    uint64 msSinceUnixEpoch = uint64(nsSinceGregorianEpoch / 10000) -
      12219292800000;

    return msSinceUnixEpoch;
  }
}
