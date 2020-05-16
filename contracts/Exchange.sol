// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { ECDSA } from '@openzeppelin/contracts/cryptography/ECDSA.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';

import { Owned } from './Owned.sol';
import { SafeMath64 } from './libraries/SafeMath64.sol';
import { Signatures } from './libraries/Signatures.sol';
import { Tokens } from './libraries/Tokens.sol';
import { Transfers } from './libraries/Transfers.sol';
import {
  Enums,
  ICustodian,
  IExchange,
  Structs
} from './libraries/Interfaces.sol';


contract Exchange is IExchange, Owned {
  using SafeMath64 for uint64;
  using SafeMath256 for uint256;
  using Tokens for Tokens.Storage;

  // Events //

  /**
   * @dev Emitted when an admin changes the Chain Propagation Period tunable parameter with `setChainPropagationPeriod`
   */
  event ChainPropagationPeriodChanged(uint256 previousValue, uint256 newValue);
  /**
   * @dev Emitted when a user deposits ETH with `depositEther` or a token with `depositToken` or `depositTokenBySymbol`
   */
  event Deposited(
    address indexed wallet,
    address indexed asset,
    uint64 quantityInPips,
    uint64 index
  );
  /**
   * @dev Emitted when an admin changes the Dispatch Wallet tunable parameter with `setDispatcher`
   */
  event DispatcherChanged(address previousValue, address newValue);

  /**
   * @dev Emitted when an admin changes the Fee Wallet tunable parameter with `setFeeWallet`
   */
  event FeeWalletChanged(address previousValue, address newValue);

  /**
   * @dev Emitted when a user invalidates an order nonce with `invalidateOrderNonce`
   */
  event InvalidatedOrderNonce(
    address indexed wallet,
    uint128 nonce,
    uint128 timestamp,
    uint256 effectiveBlockNumber
  );
  /**
   * @dev Emitted when an admin initiates the token registration process with `registerToken`
   */
  event RegisteredToken(
    address indexed tokenAddress,
    string symbol,
    uint8 decimals
  );
  /**
   * @dev Emitted when an admin finalizes the token registration process with `confirmTokenRegistration`, after
   * which it can be deposited, traded, or withdrawn
   */
  event ConfirmedRegisteredToken(
    address indexed tokenAddress,
    string symbol,
    uint8 decimals
  );
  /**
   * @dev Emitted when the Dispatcher Wallet submits a trade for execution with `executeTrade`
   */
  event ExecutedTrade(
    address buyWallet,
    address sellWallet,
    string indexed baseSymbol,
    string indexed quoteSymbol,
    uint64 baseQuantityInPips,
    uint64 quoteQuantityInPips,
    uint64 tradePrice,
    bytes32 buyOrderHash,
    bytes32 sellOrderHash
  );
  /**
   * @dev Emitted when an admin changes the Maximum Maker Fee Rate tunable parameter with `setTradeMakerFeeBasisPoints`
   */
  event TradeMakerFeeChanged(uint64 previousValue, uint64 newValue);

  /**
   * @dev Emitted when an admin changes the Maximum Taker Fee Rate tunable parameter with `setTradeTakerFeeBasisPoints`
   */
  event TradeTakerFeeChanged(uint64 previousValue, uint64 newValue);

  /**
   * @dev Emitted when a user invokes the Exit Wallet mechanism with `exitWallet`
   */
  event WalletExited(address indexed wallet, uint256 effectiveBlockNumber);
  /**
   * @dev Emitted when a user withdraws an asset balance through the Exit Wallet mechanism with `withdrawExit`
   */
  event WalletExitWithdrawn(
    address indexed wallet,
    address asset,
    uint256 quantity
  );
  /**
   * @dev Emitted when the Dispatcher Wallet submits a withdrawal with `withdraw`
   */
  event Withdrawn(address indexed wallet, address asset, uint256 quantity);
  /**
   * @dev Emitted when an admin changes the Maximum Structs.Withdrawal Fee Rate tunable parameter with `setWithdrawalFeeBasisPoints`
   */
  event WithdrawalFeeChanged(uint64 previousValue, uint64 newValue);

  // Structs //

  struct NonceInvalidation {
    bool exists;
    uint64 timestamp;
    uint256 effectiveBlockNumber;
  }
  struct WalletExit {
    bool exists;
    uint256 effectiveBlockNumber;
  }

  // Storage //

  // Mapping of order hash => isComplete
  mapping(bytes32 => bool) _completedOrderHashes;
  // Mapping of order hash => isComplete
  mapping(bytes32 => bool) _completedWithdrawalHashes;
  address payable _custodian;
  uint64 depositIndex;
  // Mapping of wallet => asset => balance
  mapping(address => mapping(address => uint256)) _balances;
  // Mapping of wallet => last invalidated timestamp
  mapping(address => NonceInvalidation) _nonceInvalidations;
  // Mapping of order hash => filled quantity in pips
  mapping(bytes32 => uint64) _partiallyFilledOrderQuantities;
  Tokens.Storage internal _tokens;
  mapping(address => WalletExit) _walletExits;
  // Tunable parameters
  uint256 _chainPropagationPeriod;
  address dispatcher;
  address _feeWallet;
  uint64 _tradeMakerFeeBasisPoints;
  uint64 _tradeTakerFeeBasisPoints;
  uint64 _withdrawalFeeBasisPoints;
  // Guards on tunable parameters
  uint256 immutable _maxChainPropagationPeriod;
  uint64 immutable _maxTradeFeeBasisPoints;
  uint64 immutable _maxWithdrawalFeeBasisPoints;

  /**
   * @dev Sets `owner` and `admin` to `msg.sender`. Sets the values for `_maxChainPropagationPeriod`,
   * `_maxWithdrawalFeeBasisPoints`, and `_maxTradeFeeBasisPoints` to 1 week, 10%, and 10% respectively.
   * All three of these values are immutable, and cannot be changed after construction
   */
  constructor() public Owned() {
    _maxChainPropagationPeriod = (7 * 24 * 60 * 60) / 15; // 1 week at 15s/block
    _maxWithdrawalFeeBasisPoints = 10 * 100; // 10%
    _maxTradeFeeBasisPoints = 10 * 100; // 10%
  }

  /**
   * @dev Sets the address of the `Custodian` contract. This value is immutable once set and cannot be changed again
   *
   * @param newCustodian The address of the `Custodian` contract deployed against this `Exchange` contract's address
   */
  function setCustodian(address payable newCustodian) external onlyAdmin {
    require(_custodian == address(0x0), 'Custodian can only be set once');
    require(newCustodian != address(0x0), 'Invalid address');

    _custodian = newCustodian;
  }

  /*** Tunable parameters ***/

  /**
   * @dev Sets the address of the `Custodian` contract. This value is immutable once set and cannot be changed again
   *
   * @param newChainPropagationPeriod The new Chain Propagation Period expressed as a number of blocks. Must be less
   * than `_maxChainPropagationPeriod`
   */
  function setChainPropagationPeriod(uint256 newChainPropagationPeriod)
    external
    onlyAdmin
  {
    require(
      newChainPropagationPeriod < _maxChainPropagationPeriod,
      'Must be less than 1 week'
    );

    uint256 oldChainPropagationPeriod = _chainPropagationPeriod;
    _chainPropagationPeriod = newChainPropagationPeriod;

    emit ChainPropagationPeriodChanged(
      oldChainPropagationPeriod,
      newChainPropagationPeriod
    );
  }

  /**
   * @dev Sets the address of the Fee wallet. Structs.Trade and Withdraw fees will accrue in the `_balances`
   * mappings for this wallet
   *
   * @param newFeeWallet The new Fee wallet. Must be different from the current one
   */
  function setFeeWallet(address newFeeWallet) external onlyAdmin {
    require(newFeeWallet != address(0x0), 'Invalid wallet address');
    require(
      newFeeWallet != _feeWallet,
      'Must be different from current fee wallet'
    );

    address oldFeeWallet = _feeWallet;
    _feeWallet = newFeeWallet;

    emit FeeWalletChanged(oldFeeWallet, newFeeWallet);
  }

  /**
   * @dev Sets the Maximum Structs.Withdrawal Fee Rate
   *
   * @param newWithdrawalFeeBasisPoints The new rate expressed in basis points
   */
  function setWithdrawalFeeBasisPoints(uint64 newWithdrawalFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      newWithdrawalFeeBasisPoints < _maxWithdrawalFeeBasisPoints,
      'Excessive withdrawal fee'
    );

    uint64 oldWithdrawalFeeBasisPoints = _withdrawalFeeBasisPoints;
    _withdrawalFeeBasisPoints = newWithdrawalFeeBasisPoints;

    emit WithdrawalFeeChanged(
      oldWithdrawalFeeBasisPoints,
      newWithdrawalFeeBasisPoints
    );
  }

  /**
   * @dev Sets the Maximum Maker Fee Rate
   * @param newTradeMakerFeeBasisPoints The new rate expressed in basis points
   */
  function setTradeMakerFeeBasisPoints(uint64 newTradeMakerFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      newTradeMakerFeeBasisPoints < _maxTradeFeeBasisPoints,
      'Excessive maker fee'
    );

    uint64 oldTradeMakerFeeBasisPoints = _tradeMakerFeeBasisPoints;
    _tradeMakerFeeBasisPoints = newTradeMakerFeeBasisPoints;

    emit TradeMakerFeeChanged(
      oldTradeMakerFeeBasisPoints,
      newTradeMakerFeeBasisPoints
    );
  }

  /**
   * @dev Sets the Maximum Taker Fee Rate
   * @param newTradeTakerFeeBasisPoints The new rate expressed in basis points
   */
  function setTradeTakerFeeBasisPoints(uint64 newTradeTakerFeeBasisPoints)
    external
    onlyAdmin
  {
    require(
      newTradeTakerFeeBasisPoints < _maxTradeFeeBasisPoints,
      'Excessive taker fee'
    );

    uint64 oldTradeTakerFeeBasisPoints = _tradeTakerFeeBasisPoints;
    _tradeTakerFeeBasisPoints = newTradeTakerFeeBasisPoints;

    emit TradeTakerFeeChanged(
      oldTradeTakerFeeBasisPoints,
      newTradeTakerFeeBasisPoints
    );
  }

  // Accessors //

  /**
   * @dev Returns the amount of `asset` currently deposited by `wallet`
   */
  function balanceOf(address wallet, address asset)
    external
    view
    returns (uint256)
  {
    return _balances[wallet][asset];
  }

  /**
   * @dev Only partially filled orders will return a non-zero value, filled orders will return 0.
   * Invalidating an order nonce will not clear partial fill quantities for earlier orders because
   * the gas cost for this is potentially unbound
   */
  function partiallyFilledOrderQuantityInPips(bytes32 orderHash)
    external
    view
    returns (uint64)
  {
    return _partiallyFilledOrderQuantities[orderHash];
  }

  // Depositing //

  /**
   * Deposit ETH
   */
  function depositEther() external payable {
    deposit(msg.sender, address(0x0), msg.value);
  }

  /**
   * Deposit `IERC20` compliant tokens
   *
   * @param tokenAddress The token contract address
   * @param quantity The quantity to deposit. The sending wallet must first call the `approve` method on
   * the token contract for at least this quantity first
   */
  function depositToken(address tokenAddress, uint256 quantity) external {
    require(tokenAddress != address(0x0), 'Use depositEther to deposit Ether');
    deposit(msg.sender, tokenAddress, quantity);
  }

  /**
   * Deposit `IERC20` compliant tokens
   *
   * @param tokenSymbol The case-sensitive symbol string for the token
   * @param quantity The quantity to deposit. The sending wallet must first call the `approve` method on
   * the token contract for at least this quantity first
   */
  function depositTokenBySymbol(string calldata tokenSymbol, uint256 quantity)
    external
  {
    address tokenAddress = _tokens.tokenSymbolToAddress(
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
    // Calling exitWallet immediately disables deposits, in contrast to withdrawals and trades which
    // respect the `effectiveBlockNumber` via `isWalletExitFinalized`
    require(!_walletExits[wallet].exists, 'Wallet exited');

    // If asset is a token, it must be registered
    if (asset != address(0x0)) {
      Tokens.Token storage token = _tokens.tokensByAddress[asset];
      require(
        token.exists && token.isConfirmed,
        'No confirmed token found for address'
      );
    }
    uint64 quantityInPips = _tokens.transferFromWallet(wallet, asset, quantity);

    // Any fractional amount in the deposited quantity that is too small to express in pips
    // accumulates as dust in the `Exchange` contract
    uint256 tokenQuantityInPipPrecision = _tokens.pipsToTokenQuantity(
      quantityInPips,
      asset
    );
    uint256 newBalance = _balances[wallet][asset].add(
      tokenQuantityInPipPrecision
    );
    _balances[wallet][asset] = newBalance;
    Transfers.transferTo(_custodian, asset, tokenQuantityInPipPrecision);

    depositIndex++;
    emit Deposited(wallet, asset, quantityInPips, depositIndex);
  }

  // Invalidation //

  /**
   * Invalidate all order nonces with a timestamp lower than the one provided
   *
   * @param nonce A Version 1 UUID. After calling, any order nonces from this wallet with a
   * timestamp component lower than the one provided will be rejected by `executeTrade`
   */
  function invalidateOrderNonce(uint128 nonce) external {
    uint64 timestamp = getTimestampFromUuid(nonce);

    if (_nonceInvalidations[msg.sender].exists) {
      require(
        _nonceInvalidations[msg.sender].timestamp < timestamp,
        'Nonce timestamp already invalidated'
      );
      require(
        _nonceInvalidations[msg.sender].effectiveBlockNumber <= block.number,
        'Previous invalidation awaiting chain propagation'
      );
    }

    _nonceInvalidations[msg.sender] = NonceInvalidation(
      true,
      timestamp,
      block.number + _chainPropagationPeriod
    );

    emit InvalidatedOrderNonce(
      msg.sender,
      nonce,
      timestamp,
      block.number + _chainPropagationPeriod
    );
  }

  // Withdrawing //

  /**
   * Settles a user withdrawal submitted off-chain. Calls restricted to currently whitelisted Dispatcher wallet
   *
   * @param withdrawal A `Structs.Withdrawal` struct encoding the parameters of the withdrawal
   * @param withdrawalTokenSymbol The case-sensitive token symbol. Mutually exclusive with the `assetAddress`
   * field of the `withdrawal` struct argument
   * @param withdrawalWalletSignature The ECDSA signature of the withdrawal hash as produced by
   * `Signatures.getWithdrawalWalletHash`
   */
  function withdraw(
    Structs.Withdrawal calldata withdrawal,
    string calldata withdrawalTokenSymbol,
    bytes calldata withdrawalWalletSignature
  ) external override onlyDispatcher {
    // Validations
    require(!isWalletExitFinalized(withdrawal.walletAddress), 'Wallet exited');
    require(
      getFeeBasisPoints(withdrawal.gasFee, withdrawal.quantity) <=
        _withdrawalFeeBasisPoints,
      'Excessive withdrawal fee'
    );
    bytes32 withdrawalHash = validateWithdrawalSignature(
      withdrawal,
      withdrawalTokenSymbol,
      withdrawalWalletSignature
    );
    require(
      !_completedWithdrawalHashes[withdrawalHash],
      'Hash already withdrawn'
    );

    // If withdrawal is by asset symbol (most common) then resolve to asset address
    address assetAddress = withdrawal.withdrawalType ==
      Enums.WithdrawalType.BySymbol
      ? _tokens.tokenSymbolToAddress(
        withdrawalTokenSymbol,
        getTimestampFromUuid(withdrawal.nonce)
      )
      : withdrawal.assetAddress;

    // SafeMath reverts if overdrawn
    uint256 quantityInWei = _tokens.pipsToTokenQuantity(
      withdrawal.quantity,
      assetAddress
    );
    _balances[withdrawal.walletAddress][assetAddress] = _balances[withdrawal
      .walletAddress][assetAddress]
      .sub(quantityInWei);
    _balances[_feeWallet][withdrawal
      .assetAddress] = _balances[_feeWallet][assetAddress].add(
      _tokens.pipsToTokenQuantity(withdrawal.gasFee, assetAddress)
    );

    ICustodian(_custodian).withdraw(
      withdrawal.walletAddress,
      assetAddress,
      _tokens.pipsToTokenQuantity(
        withdrawal.quantity.sub(withdrawal.gasFee),
        assetAddress
      )
    );

    _completedWithdrawalHashes[withdrawalHash] = true;

    emit Withdrawn(withdrawal.walletAddress, assetAddress, quantityInWei);
  }

  // Wallet exits //

  /**
   * Permanently flags the sending wallet as exited, immediately disabling deposits. Once the
   * Chain Propagation Delay passes trades and withdrawals are also disabled for the wallet,
   * and assets may be withdrawn one at a time via `withdrawExit`
   */
  function exitWallet() external {
    require(!_walletExits[msg.sender].exists, 'Wallet already exited');

    _walletExits[msg.sender] = WalletExit(
      true,
      block.number + _chainPropagationPeriod
    );

    emit WalletExited(msg.sender, block.number + _chainPropagationPeriod);
  }

  /**
   * Withdraw the entire balance of an asset for an exited wallet. The Chain Propagation Delay must
   * have already passed since calling `exitWallet`
   */
  function withdrawExit(address assetAddress) external {
    require(_walletExits[msg.sender].exists, 'Wallet not yet exited');
    require(
      isWalletExitFinalized(msg.sender),
      'Wallet exit block delay not yet elapsed'
    );

    uint256 balance = _balances[msg.sender][assetAddress];
    require(balance > 0, 'No balance for asset');
    _balances[msg.sender][assetAddress] = 0;

    ICustodian(_custodian).withdraw(msg.sender, assetAddress, balance);

    emit WalletExitWithdrawn(msg.sender, assetAddress, balance);
  }

  function isWalletExitFinalized(address wallet) internal view returns (bool) {
    WalletExit storage exit = _walletExits[wallet];
    return exit.exists && exit.effectiveBlockNumber <= block.number;
  }

  // Trades //

  /**
   * Settles a trade between two orders submitted and matched off-chain
   * @dev Variable-length fields like strings and bytes cannot be encoded in an argument struct, and
   * must be passed in as separate arguments. As a gas optimization, base and quote symbols are passed
   * in separately and combined to verify the wallet hash, since this is cheaper than splitting the
   * market symbol into its two constituent asset symbols
   * @dev Stack level too deep if declared external
   *
   * @param buy An `Structs.Order` struct encoding the parameters of the buy-side order (giving quote, receiving base)
   * @param buyBaseSymbol The case-sensitive symbol for the market base asset for the buy order
   * @param buyQuoteSymbol The case-sensitive symbol for the market quote asset for the buy order
   * @param buyClientOrderId An optional custom client ID for the buy order
   * @param buyWalletSignature The ECDSA signature of the buy order hash as produced by `Signatures.getOrderWalletHash`
   * @param sell An `Structs.Order` struct encoding the parameters of the sell-side order (giving base, receiving quote)
   * @param sellBaseSymbol The case-sensitive symbol for the market base asset for the sell order
   * @param sellQuoteSymbol The case-sensitive symbol for the market quote asset for the sell order
   * @param sellClientOrderId An optional custom client ID for the sell order
   * @param sellWalletSignature The ECDSA signature of the sell order hash as produced by `Signatures.getOrderWalletHash`
   * @param trade A `trade` struct encoding the parameters of this trade execution of the counterparty orders
   */
  function executeTrade(
    Structs.Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    string memory buyClientOrderId,
    bytes memory buyWalletSignature,
    Structs.Order memory sell,
    string memory sellBaseSymbol,
    string memory sellQuoteSymbol,
    string memory sellClientOrderId,
    bytes memory sellWalletSignature,
    Structs.Trade memory trade
  ) public override onlyDispatcher {
    require(!isWalletExitFinalized(buy.walletAddress), 'Buy wallet exited');
    require(!isWalletExitFinalized(sell.walletAddress), 'Sell wallet exited');

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
      trade.price,
      buyHash,
      sellHash
    );
  }

  // Updates buyer, seller, and fee wallet balances for both assets in trade pair according to trade parameters
  function updateBalancesForTrade(
    Structs.Order memory buy,
    Structs.Order memory sell,
    Structs.Trade memory trade
  ) private {
    // Buyer receives base asset minus fees
    _balances[buy.walletAddress][buy.baseAssetAddress] = _balances[buy
      .walletAddress][buy.baseAssetAddress]
      .add(
      _tokens.pipsToTokenQuantity(trade.netBaseQuantity, buy.baseAssetAddress)
    );
    // Buyer gives quote asset including fees
    _balances[buy.walletAddress][buy.quoteAssetAddress] = _balances[buy
      .walletAddress][buy.quoteAssetAddress]
      .sub(
      _tokens.pipsToTokenQuantity(
        trade.grossQuoteQuantity,
        buy.quoteAssetAddress
      )
    );

    // Seller gives base asset including fees
    _balances[sell.walletAddress][sell.baseAssetAddress] = _balances[sell
      .walletAddress][sell.baseAssetAddress]
      .sub(
      _tokens.pipsToTokenQuantity(
        trade.grossBaseQuantity,
        sell.baseAssetAddress
      )
    );
    // Seller receives quote asset minus fees
    _balances[sell.walletAddress][sell.quoteAssetAddress] = _balances[sell
      .walletAddress][sell.quoteAssetAddress]
      .add(
      _tokens.pipsToTokenQuantity(
        trade.netQuoteQuantity,
        sell.quoteAssetAddress
      )
    );

    // Maker and taker fees to fee wallet
    _balances[_feeWallet][trade
      .makerFeeAssetAddress] = _balances[_feeWallet][trade.makerFeeAssetAddress]
      .add(
      _tokens.pipsToTokenQuantity(
        trade.makerFeeQuantity,
        trade.makerFeeAssetAddress
      )
    );
    _balances[_feeWallet][trade
      .takerFeeAssetAddress] = _balances[_feeWallet][trade.takerFeeAssetAddress]
      .add(
      _tokens.pipsToTokenQuantity(
        trade.takerFeeQuantity,
        trade.takerFeeAssetAddress
      )
    );
  }

  function updateOrderFilledQuantities(
    Structs.Order memory buyOrder,
    bytes32 buyOrderHash,
    Structs.Order memory sellOrder,
    bytes32 sellOrderHash,
    Structs.Trade memory trade
  ) private {
    updateOrderFilledQuantity(buyOrder, buyOrderHash, trade);
    updateOrderFilledQuantity(sellOrder, sellOrderHash, trade);
  }

  // Update filled quantities tracking for order to prevent over- or double-filling orders
  function updateOrderFilledQuantity(
    Structs.Order memory order,
    bytes32 orderHash,
    Structs.Trade memory trade
  ) private {
    require(!_completedOrderHashes[orderHash], 'Structs.Order double filled');

    uint64 newFilledQuantity = trade.grossBaseQuantity.add(
      _partiallyFilledOrderQuantities[orderHash]
    );
    require(
      newFilledQuantity <= order.totalQuantity,
      'Structs.Order overfilled'
    );

    if (newFilledQuantity < order.totalQuantity) {
      _partiallyFilledOrderQuantities[orderHash] = newFilledQuantity;
    } else {
      delete _partiallyFilledOrderQuantities[orderHash];
      _completedOrderHashes[orderHash] = true;
    }
  }

  // Validations //

  function validateAssetPair(
    Structs.Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    Structs.Order memory sell,
    string memory sellBaseSymbol,
    string memory sellQuoteSymbol,
    Structs.Trade memory trade
  ) private view {
    validateTokenAddresses(buy, buyBaseSymbol, buyQuoteSymbol);
    validateTokenAddresses(sell, sellBaseSymbol, sellQuoteSymbol);

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
    Structs.Order memory buy,
    Structs.Order memory sell,
    Structs.Trade memory trade
  ) private pure {
    require(
      trade.grossBaseQuantity > 0,
      'Base quantity must be greater than zero'
    );
    require(
      trade.grossQuoteQuantity > 0,
      'Quote quantity must be greater than zero'
    );
    uint64 price = trade.grossQuoteQuantity.mul(10**8).div(
      trade.grossBaseQuantity
    );

    bool exceedsBuyLimit = isLimitOrderType(buy.orderType) &&
      price > buy.limitPrice;
    require(!exceedsBuyLimit, 'Buy order limit price exceeded');

    bool exceedsSellLimit = isLimitOrderType(sell.orderType) &&
      price < sell.limitPrice;
    require(!exceedsSellLimit, 'Sell order limit price exceeded');
  }

  function validateTokenAddresses(
    Structs.Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol
  ) private view {
    uint64 timestamp = getTimestampFromUuid(order.nonce);
    address baseAssetAddress = _tokens.tokenSymbolToAddress(
      baseSymbol,
      timestamp
    );
    address quoteAssetAddress = _tokens.tokenSymbolToAddress(
      quoteSymbol,
      timestamp
    );

    require(
      baseAssetAddress == order.baseAssetAddress &&
        quoteAssetAddress == order.quoteAssetAddress,
      order.side == Enums.OrderSide.Buy
        ? 'Buy order market symbol address resolution mismatch'
        : 'Sell order market symbol address resolution mismatch'
    );
  }

  function validateTradeFees(
    Structs.Order memory order,
    Structs.Trade memory trade
  ) private view {
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
        _tradeMakerFeeBasisPoints,
      'Excessive maker fee'
    );
    require(
      getFeeBasisPoints(trade.takerFeeQuantity, takerTotalQuantity) <=
        _tradeTakerFeeBasisPoints,
      'Excessive taker fee'
    );
  }

  function validateOrderSignatures(
    Structs.Order memory buy,
    string memory buyBaseSymbol,
    string memory buyQuoteSymbol,
    string memory buyClientOrderId,
    bytes memory buyWalletSignature,
    Structs.Order memory sell,
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
    Structs.Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol,
    string memory clientOrderId,
    bytes memory walletSignature
  ) private pure returns (bytes32) {
    bytes32 orderHash = Signatures.getOrderWalletHash(
      order,
      baseSymbol,
      quoteSymbol,
      clientOrderId
    );

    require(
      Signatures.isSignatureValid(
        orderHash,
        walletSignature,
        order.walletAddress
      ),
      order.side == Enums.OrderSide.Buy
        ? 'Invalid wallet signature for buy order'
        : 'Invalid wallet signature for sell order'
    );

    return orderHash;
  }

  function validateOrderNonces(
    Structs.Order memory buy,
    Structs.Order memory sell
  ) private view {
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
    Structs.Withdrawal memory withdrawal,
    string memory withdrawalTokenSymbol,
    bytes memory withdrawalWalletSignature
  ) private pure returns (bytes32) {
    bytes32 withdrawalHash = Signatures.getWithdrawalWalletHash(
      withdrawal,
      withdrawalTokenSymbol
    );

    require(
      Signatures.isSignatureValid(
        withdrawalHash,
        withdrawalWalletSignature,
        withdrawal.walletAddress
      ),
      'Invalid wallet signature'
    );

    return withdrawalHash;
  }

  // Token registry //

  /**
   * @dev Initiate registration process for a token asset
   */
  function registerToken(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    _tokens.registerToken(tokenAddress, symbol, decimals);
    emit RegisteredToken(tokenAddress, symbol, decimals);
  }

  /**
   * @dev Finalize registration process for a token asset. All parameters must exactly match a previous
   * call to `registerToken`
   */
  function confirmTokenRegistration(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    _tokens.confirmTokenRegistration(tokenAddress, symbol, decimals);
    emit ConfirmedRegisteredToken(tokenAddress, symbol, decimals);
  }

  function tokenSymbolToAddress(string memory tokenSymbol, uint64 timestamp)
    public
    view
    returns (address)
  {
    return _tokens.tokenSymbolToAddress(tokenSymbol, timestamp);
  }

  // RBAC //

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

  // Utils //

  function isLimitOrderType(Enums.OrderType orderType)
    private
    pure
    returns (bool)
  {
    return
      orderType == Enums.OrderType.Limit ||
      orderType == Enums.OrderType.LimitMaker ||
      orderType == Enums.OrderType.StopLossLimit ||
      orderType == Enums.OrderType.TakeProfitLimit;
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
      _nonceInvalidations[walletAddress].exists &&
      _nonceInvalidations[walletAddress].effectiveBlockNumber <= block.number
    ) {
      return _nonceInvalidations[walletAddress].timestamp;
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
