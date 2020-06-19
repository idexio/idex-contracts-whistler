// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { ECDSA } from '@openzeppelin/contracts/cryptography/ECDSA.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {
  SafeMath as SafeMath256
} from '@openzeppelin/contracts/math/SafeMath.sol';

import { AssetRegistry } from './libraries/AssetRegistry.sol';
import { AssetTransfers } from './libraries/AssetTransfers.sol';
import { AssetUnitConversions } from './libraries/AssetUnitConversions.sol';
import { Owned } from './Owned.sol';
import { SafeMath64 } from './libraries/SafeMath64.sol';
import { Signatures } from './libraries/Signatures.sol';
import {
  Enums,
  ICustodian,
  IExchange,
  Structs
} from './libraries/Interfaces.sol';
import { UUID } from './libraries/UUID.sol';


/**
 * @dev The term `asset` refers collectively to ETH and ERC-20 tokens, the term `token` refers only to the latter
 */
contract Exchange is IExchange, Owned {
  using SafeMath64 for uint64;
  using SafeMath256 for uint256;
  using AssetRegistry for AssetRegistry.Storage;

  // Events //

  /**
   * @dev Emitted when an admin changes the Chain Propagation Period tunable parameter with `setChainPropagationPeriod`
   */
  event ChainPropagationPeriodChanged(uint256 previousValue, uint256 newValue);
  /**
   * @dev Emitted when a user deposits ETH with `depositEther` or a token with `depositAsset` or `depositAssetBySymbol`
   */
  event Deposited(
    uint64 index,
    address indexed wallet,
    address indexed assetAddress,
    string indexed assetSymbol,
    uint64 quantityInPips,
    uint64 newExchangeBalanceInPips,
    uint256 newExchangeBalanceInAssetUnits
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
  event OrderNonceInvalidated(
    address indexed wallet,
    uint128 nonce,
    uint128 timestampInMs,
    uint256 effectiveBlockNumber
  );
  /**
   * @dev Emitted when an admin initiates the token registration process with `registerAsset`
   */
  event TokenRegistered(
    address indexed assetAddress,
    string indexed assetSymbol,
    uint8 decimals
  );
  /**
   * @dev Emitted when an admin finalizes the token registration process with `confirmAssetRegistration`, after
   * which it can be deposited, traded, or withdrawn
   */
  event TokenRegistrationConfirmed(
    address indexed assetAddress,
    string indexed assetSymbol,
    uint8 decimals
  );
  /**
   * @dev Emitted when the Dispatcher Wallet submits a trade for execution with `executeTrade`
   */
  event TradeExecuted(
    address buyWallet,
    address sellWallet,
    string indexed baseAssetSymbol,
    string indexed quoteAssetSymbol,
    uint64 baseQuantityInPips,
    uint64 quoteQuantityInPips,
    uint64 tradePriceInPips,
    bytes32 buyOrderHash,
    bytes32 sellOrderHash
  );

  /**
   * @dev Emitted when a user invokes the Exit Wallet mechanism with `exitWallet`
   */
  event WalletExited(address indexed wallet, uint256 effectiveBlockNumber);
  /**
   * @dev Emitted when a user withdraws an asset balance through the Exit Wallet mechanism with `withdrawExit`
   */
  event WalletExitWithdrawn(
    address indexed wallet,
    address indexed assetAddress,
    string assetSymbol,
    uint64 quantityInPips,
    uint64 newExchangeBalanceInPips,
    uint256 newExchangeBalanceInAssetUnits
  );
  /**
   * @dev Emitted when the Dispatcher Wallet submits a withdrawal with `withdraw`
   */
  event Withdrawn(
    address indexed wallet,
    address indexed assetAddress,
    string assetSymbol,
    uint64 quantityInPips,
    uint64 newExchangeBalanceInPips,
    uint256 newExchangeBalanceInAssetUnits
  );

  // Internally used structs //

  struct NonceInvalidation {
    bool exists;
    uint64 timestampInMs;
    uint256 effectiveBlockNumber;
  }
  struct WalletExit {
    bool exists;
    uint256 effectiveBlockNumber;
  }

  // Storage //

  // Asset registry data
  AssetRegistry.Storage _assetRegistry;
  // Mapping of order wallet hash => isComplete
  mapping(bytes32 => bool) _completedOrderHashes;
  // Mapping of withdrawal wallet hash => isComplete
  mapping(bytes32 => bool) _completedWithdrawalHashes;
  address payable _custodian;
  uint64 _depositIndex;
  // Mapping of wallet => asset => balance
  mapping(address => mapping(address => uint64)) _balancesInPips;
  // Mapping of wallet => last invalidated timestampInMs
  mapping(address => NonceInvalidation) _nonceInvalidations;
  // Mapping of order hash => filled quantity in pips
  mapping(bytes32 => uint64) _partiallyFilledOrderQuantitiesInPips;
  mapping(address => WalletExit) _walletExits;
  // Tunable parameters
  uint256 _chainPropagationPeriod;
  address _dispatcherWallet;
  address _feeWallet;

  // Immutable constants //

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
    _maxTradeFeeBasisPoints = 10 * 100; // 10%
    _maxWithdrawalFeeBasisPoints = 10 * 100; // 10%
  }

  /**
   * @dev Sets the address of the `Custodian` contract. The `Custodian` accepts `Exchange` and
   * `Governance` addresses in its constructor, after which they can only be changed by the
   * `Governance` contract itself. Therefore the `Custodian` must be deployed last and its address
   * set here on an existing `Exchange` contract. This value is immutable once set and cannot be
   * changed again
   *
   * @param newCustodian The address of the `Custodian` contract deployed against this `Exchange`
   * contract's address
   */
  function setCustodian(address payable newCustodian) external onlyAdmin {
    require(_custodian == address(0x0), 'Custodian can only be set once');
    require(newCustodian != address(0x0), 'Invalid address');

    _custodian = newCustodian;
  }

  /*** Tunable parameters ***/

  /**
   * @dev Sets a new Chain Propagation Period governing the delay between contract nonce
   * invalidations and exits going into effect
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
   * @dev Sets the address of the Fee wallet. Structs.Trade and Withdraw fees will accrue in the `_balancesInPips`
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

  // Accessors //

  /**
   * Returns the quantity denominated in asset units of asset with `assetAddress` currently deposited by `wallet`
   */
  function loadBalanceInAssetUnitsByAddress(
    address wallet,
    address assetAddress
  ) external view returns (uint256) {
    Structs.Asset memory asset = _assetRegistry.loadAssetByAddress(
      assetAddress
    );
    return
      AssetUnitConversions.pipsToAssetUnits(
        _balancesInPips[wallet][assetAddress],
        asset.decimals
      );
  }

  /**
   * Returns the quantity denominated in asset units of asset with `assetSymbol` currently deposited by `wallet`
   */
  function loadBalanceInAssetUnitsBySymbol(
    address wallet,
    string calldata assetSymbol
  ) external view returns (uint256) {
    Structs.Asset memory asset = _assetRegistry.loadAssetBySymbol(
      assetSymbol,
      uint64(block.timestamp * 1000)
    );
    return
      AssetUnitConversions.pipsToAssetUnits(
        _balancesInPips[wallet][asset.assetAddress],
        asset.decimals
      );
  }

  /**
   * @dev Returns the quantity denominated in pips of asset with `assetAddress` currently deposited by `wallet`
   */
  function loadBalanceInPipsByAddress(address wallet, address assetAddress)
    external
    view
    returns (uint64)
  {
    return _balancesInPips[wallet][assetAddress];
  }

  /**
   * @dev Returns the quantity denominated in pips of asset with `assetSymbol` currently deposited by `wallet`
   */
  function loadBalanceInPipsBySymbol(
    address wallet,
    string calldata assetSymbol
  ) external view returns (uint64) {
    address assetAddress = _assetRegistry
      .loadAssetBySymbol(assetSymbol, uint64(block.timestamp * 1000))
      .assetAddress;
    return _balancesInPips[wallet][assetAddress];
  }

  /**
   * @dev Returns the amount filled so far for a partially filled orders. Only partially filled
   * orders will return a non-zero value - orders in any other state will return 0. Invalidating
   * an order nonce will not clear partial fill quantities for earlier orders because the gas cost
   * would potentially be unbound
   */
  function loadPartiallyFilledOrderQuantityInPips(bytes32 orderHash)
    external
    view
    returns (uint64)
  {
    return _partiallyFilledOrderQuantitiesInPips[orderHash];
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
   * @param assetAddress The token contract address
   * @param quantityInAssetUnits The quantity to deposit. The sending wallet must first call the `approve` method on
   * the token contract for at least this quantity first
   */
  function depositTokenByAddress(
    address assetAddress,
    uint256 quantityInAssetUnits
  ) external {
    require(assetAddress != address(0x0), 'Use depositEther to deposit Ether');
    deposit(msg.sender, assetAddress, quantityInAssetUnits);
  }

  /**
   * Deposit `IERC20` compliant tokens
   *
   * @param assetSymbol The case-sensitive symbol string for the token
   * @param quantityInAssetUnits The quantity to deposit. The sending wallet must first call the `approve` method on
   * the token contract for at least this quantity first
   */
  function depositTokenBySymbol(
    string calldata assetSymbol,
    uint256 quantityInAssetUnits
  ) external {
    address assetAddress = _assetRegistry
      .loadAssetBySymbol(assetSymbol, uint64(block.timestamp * 1000))
      .assetAddress;
    require(assetAddress != address(0x0), 'Use depositEther to deposit ETH');

    deposit(msg.sender, assetAddress, quantityInAssetUnits);
  }

  function deposit(
    address payable wallet,
    address assetAddress,
    uint256 quantityInAssetUnits
  ) private {
    // Calling exitWallet disables deposits immediately on mining, in contrast to withdrawals and
    // trades which respect the Chain Propagation Delay given by `effectiveBlockNumber` via
    // `isWalletExitFinalized`
    require(!_walletExits[wallet].exists, 'Wallet exited');

    Structs.Asset memory asset = _assetRegistry.loadAssetByAddress(
      assetAddress
    );
    uint64 quantityInPips = AssetUnitConversions.assetUnitsToPips(
      quantityInAssetUnits,
      asset.decimals
    );
    require(quantityInPips > 0, 'Quantity is too low');

    // Convert from pips back into asset units to remove any fractional amount that is too small
    // to express in pips. If the asset is ETH, this leftover fractional amount accumulates as dust
    // in the `Exchange` contract. If the asset is a token the `Exchange` will call `transferFrom`
    // without this fractional amount and there will be no dust
    uint256 quantityInAssetUnitsWithoutFractionalPips = AssetUnitConversions
      .pipsToAssetUnits(quantityInPips, asset.decimals);

    // If the asset is ETH then the funds were already assigned to this contract via msg.value. If
    // the asset is a token, additionally call the transferFrom function on the token contract for
    // the pre-approved asset quantity
    if (assetAddress != address(0x0)) {
      AssetTransfers.transferFrom(
        wallet,
        assetAddress,
        quantityInAssetUnitsWithoutFractionalPips
      );
    }
    // Forward the funds to the `Custodian`
    AssetTransfers.transferTo(
      _custodian,
      assetAddress,
      quantityInAssetUnitsWithoutFractionalPips
    );

    uint64 newExchangeBalanceInPips = _balancesInPips[wallet][assetAddress].add(
      quantityInPips
    );
    uint256 newExchangeBalanceInAssetUnits = AssetUnitConversions
      .pipsToAssetUnits(newExchangeBalanceInPips, asset.decimals);

    // Update balance with actual transferred quantity
    _balancesInPips[wallet][assetAddress] = newExchangeBalanceInPips;
    _depositIndex++;

    emit Deposited(
      _depositIndex,
      wallet,
      assetAddress,
      asset.symbol,
      quantityInPips,
      newExchangeBalanceInPips,
      newExchangeBalanceInAssetUnits
    );
  }

  // Invalidation //

  /**
   * Invalidate all order nonces with a timestampInMs lower than the one provided
   *
   * @param nonce A Version 1 UUID. After calling and once the Chain Propagation Period has elapsed,
   * `executeTrade` will reject order nonces from this wallet with a timestampInMs component lower than
   * the one provided
   */
  function invalidateOrderNonce(uint128 nonce) external {
    uint64 timestampInMs = UUID.getTimestampInMsFromUuidV1(nonce);
    // Enforce a maximum skew for invalidating nonce timestamps in the future so the user doesn't
    // lock their wallet from trades indefinitely
    uint64 oneDayFromNowMs = (uint64(block.timestamp) + 24 * 60 * 60) * 1000;
    require(
      timestampInMs < oneDayFromNowMs,
      'Nonce timestamp too far in future'
    );

    if (_nonceInvalidations[msg.sender].exists) {
      require(
        _nonceInvalidations[msg.sender].timestampInMs < timestampInMs,
        'Nonce timestamp already invalidated'
      );
      require(
        _nonceInvalidations[msg.sender].effectiveBlockNumber <= block.number,
        'Previous invalidation awaiting chain propagation'
      );
    }

    // Changing the Chain Propagation Period will not affect the effectiveBlockNumber for this invalidation
    uint256 effectiveBlockNumber = block.number + _chainPropagationPeriod;
    _nonceInvalidations[msg.sender] = NonceInvalidation(
      true,
      timestampInMs,
      effectiveBlockNumber
    );

    emit OrderNonceInvalidated(
      msg.sender,
      nonce,
      timestampInMs,
      effectiveBlockNumber
    );
  }

  // Withdrawing //

  /**
   * Settles a user withdrawal submitted off-chain. Calls restricted to currently whitelisted Dispatcher wallet
   *
   * @param withdrawal A `Structs.Withdrawal` struct encoding the parameters of the withdrawal
   */
  function withdraw(Structs.Withdrawal memory withdrawal)
    public
    override
    onlyDispatcher
  {
    // Validations
    require(!isWalletExitFinalized(withdrawal.walletAddress), 'Wallet exited');
    require(
      getFeeBasisPoints(withdrawal.gasFeeInPips, withdrawal.quantityInPips) <=
        _maxWithdrawalFeeBasisPoints,
      'Excessive withdrawal fee'
    );
    bytes32 withdrawalHash = validateWithdrawalSignature(withdrawal);
    require(
      !_completedWithdrawalHashes[withdrawalHash],
      'Hash already withdrawn'
    );

    // If withdrawal is by asset symbol (most common) then resolve to asset address
    Structs.Asset memory asset = withdrawal.withdrawalType ==
      Enums.WithdrawalType.BySymbol
      ? _assetRegistry.loadAssetBySymbol(
        withdrawal.assetSymbol,
        UUID.getTimestampInMsFromUuidV1(withdrawal.nonce)
      )
      : _assetRegistry.loadAssetByAddress(withdrawal.assetAddress);

    // SafeMath reverts if balance is overdrawn
    uint64 netAssetQuantityInPips = withdrawal.quantityInPips.sub(
      withdrawal.gasFeeInPips
    );
    uint256 netAssetQuantityInAssetUnits = AssetUnitConversions
      .pipsToAssetUnits(netAssetQuantityInPips, asset.decimals);
    uint64 newExchangeBalanceInPips = _balancesInPips[withdrawal
      .walletAddress][asset.assetAddress]
      .sub(withdrawal.quantityInPips);
    uint256 newExchangeBalanceInAssetUnits = AssetUnitConversions
      .pipsToAssetUnits(newExchangeBalanceInPips, asset.decimals);

    _balancesInPips[withdrawal.walletAddress][asset
      .assetAddress] = newExchangeBalanceInPips;
    _balancesInPips[_feeWallet][asset
      .assetAddress] = _balancesInPips[_feeWallet][asset.assetAddress].add(
      withdrawal.gasFeeInPips
    );

    ICustodian(_custodian).withdraw(
      withdrawal.walletAddress,
      asset.assetAddress,
      netAssetQuantityInAssetUnits
    );

    _completedWithdrawalHashes[withdrawalHash] = true;

    emit Withdrawn(
      withdrawal.walletAddress,
      asset.assetAddress,
      asset.symbol,
      withdrawal.quantityInPips,
      newExchangeBalanceInPips,
      newExchangeBalanceInAssetUnits
    );
  }

  // Wallet exits //

  /**
   * Permanently flags the sending wallet as exited, immediately disabling deposits on mining. After
   * the Chain Propagation Delay passes trades and withdrawals are also disabled for the wallet, and
   * assets may then be withdrawn one at a time via `withdrawExit`
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
    require(isWalletExitFinalized(msg.sender), 'Wallet exit not finalized');

    Structs.Asset memory asset = _assetRegistry.loadAssetByAddress(
      assetAddress
    );
    uint64 balanceInPips = _balancesInPips[msg.sender][assetAddress];
    uint256 balanceInAssetUnits = AssetUnitConversions.pipsToAssetUnits(
      balanceInPips,
      asset.decimals
    );

    require(balanceInAssetUnits > 0, 'No balance for asset');
    _balancesInPips[msg.sender][assetAddress] = 0;
    ICustodian(_custodian).withdraw(
      msg.sender,
      assetAddress,
      balanceInAssetUnits
    );

    emit WalletExitWithdrawn(
      msg.sender,
      assetAddress,
      asset.symbol,
      balanceInPips,
      0,
      0
    );
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
   * @param buy A `Structs.Order` struct encoding the parameters of the buy-side order (receiving base, giving quote)
   * @param sell A `Structs.Order` struct encoding the parameters of the sell-side order (giving base, receiving quote)
   * @param trade A `trade` struct encoding the parameters of this trade execution of the counterparty orders
   */
  function executeTrade(
    Structs.Order memory buy,
    Structs.Order memory sell,
    Structs.Trade memory trade
  ) public override onlyDispatcher {
    require(!isWalletExitFinalized(buy.walletAddress), 'Buy wallet exited');
    require(!isWalletExitFinalized(sell.walletAddress), 'Sell wallet exited');
    require(
      buy.walletAddress != sell.walletAddress,
      'Self-trading not allowed'
    );

    validateAssetPair(buy, sell, trade);
    validateLimitPrices(buy, sell, trade);
    validateOrderNonces(buy, sell);
    (bytes32 buyHash, bytes32 sellHash) = validateOrderSignatures(
      buy,
      sell,
      trade
    );
    validateTradeFees(trade);

    updateOrderFilledQuantities(buy, buyHash, sell, sellHash, trade);
    updateBalancesForTrade(buy, sell, trade);

    emit TradeExecuted(
      buy.walletAddress,
      sell.walletAddress,
      trade.baseAssetSymbol,
      trade.quoteAssetSymbol,
      trade.grossBaseQuantityInPips,
      trade.grossQuoteQuantityInPips,
      trade.priceInPips,
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
    // Seller gives base asset including fees
    _balancesInPips[sell.walletAddress][trade
      .baseAssetAddress] = _balancesInPips[sell.walletAddress][trade
      .baseAssetAddress]
      .sub(trade.grossBaseQuantityInPips);
    // Buyer receives base asset minus fees
    _balancesInPips[buy.walletAddress][trade
      .baseAssetAddress] = _balancesInPips[buy.walletAddress][trade
      .baseAssetAddress]
      .add(trade.netBaseQuantityInPips);

    // Buyer gives quote asset including fees
    _balancesInPips[buy.walletAddress][trade
      .quoteAssetAddress] = _balancesInPips[buy.walletAddress][trade
      .quoteAssetAddress]
      .sub(trade.grossQuoteQuantityInPips);
    // Seller receives quote asset minus fees
    _balancesInPips[sell.walletAddress][trade
      .quoteAssetAddress] = _balancesInPips[sell.walletAddress][trade
      .quoteAssetAddress]
      .add(trade.netQuoteQuantityInPips);

    // Maker and taker fees to fee wallet
    _balancesInPips[_feeWallet][trade
      .makerFeeAssetAddress] = _balancesInPips[_feeWallet][trade
      .makerFeeAssetAddress]
      .add(trade.makerFeeQuantityInPips);
    _balancesInPips[_feeWallet][trade
      .takerFeeAssetAddress] = _balancesInPips[_feeWallet][trade
      .takerFeeAssetAddress]
      .add(trade.takerFeeQuantityInPips);
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
    require(!_completedOrderHashes[orderHash], 'Order double filled');

    // Total asset quantity the order was placed for
    uint64 orderQuantityInPips;
    // Total quantity of above filled as a result of all trade executions, including this one
    uint64 newFilledQuantityInPips;

    // Market orders can express quantity in quote terms, and can be partially filled by multiple
    // limit maker orders necessitating tracking partially filled amounts in quote terms to
    // determine completion
    if (order.quoteOrderQuantityInPips > 0) {
      require(
        isMarketOrderType(order.orderType),
        'Order quote quantity only valid for market orders'
      );

      orderQuantityInPips = order.quoteOrderQuantityInPips;
      newFilledQuantityInPips = trade.grossQuoteQuantityInPips.add(
        _partiallyFilledOrderQuantitiesInPips[orderHash]
      );
    } else {
      // All other orders track partially filled quantities in base terms
      orderQuantityInPips = order.quantityInPips;
      newFilledQuantityInPips = trade.grossBaseQuantityInPips.add(
        _partiallyFilledOrderQuantitiesInPips[orderHash]
      );
    }

    require(newFilledQuantityInPips <= orderQuantityInPips, 'Order overfilled');

    if (newFilledQuantityInPips < orderQuantityInPips) {
      // If the order was partially filled, track the new filled quantity
      _partiallyFilledOrderQuantitiesInPips[orderHash] = newFilledQuantityInPips;
    } else {
      // If the order was completed, delete any partial fill tracking and instead track its completion
      // to prevent future double fills
      delete _partiallyFilledOrderQuantitiesInPips[orderHash];
      _completedOrderHashes[orderHash] = true;
    }
  }

  // Validations //

  function validateAssetPair(
    Structs.Order memory buy,
    Structs.Order memory sell,
    Structs.Trade memory trade
  ) private view {
    require(
      trade.baseAssetAddress != trade.quoteAssetAddress,
      'Base and quote assets must be different'
    );

    // Buy order market pair
    Structs.Asset memory buyBaseAsset = _assetRegistry.loadAssetBySymbol(
      trade.baseAssetSymbol,
      UUID.getTimestampInMsFromUuidV1(buy.nonce)
    );
    Structs.Asset memory buyQuoteAsset = _assetRegistry.loadAssetBySymbol(
      trade.quoteAssetSymbol,
      UUID.getTimestampInMsFromUuidV1(buy.nonce)
    );
    require(
      buyBaseAsset.assetAddress == trade.baseAssetAddress &&
        buyQuoteAsset.assetAddress == trade.quoteAssetAddress,
      'Buy order market symbol address resolution mismatch'
    );

    // Sell order market pair
    Structs.Asset memory sellBaseAsset = _assetRegistry.loadAssetBySymbol(
      trade.baseAssetSymbol,
      UUID.getTimestampInMsFromUuidV1(sell.nonce)
    );
    Structs.Asset memory sellQuoteAsset = _assetRegistry.loadAssetBySymbol(
      trade.quoteAssetSymbol,
      UUID.getTimestampInMsFromUuidV1(sell.nonce)
    );
    require(
      sellBaseAsset.assetAddress == trade.baseAssetAddress &&
        sellQuoteAsset.assetAddress == trade.quoteAssetAddress,
      'Sell order market symbol address resolution mismatch'
    );

    // Fee asset validation
    require(
      trade.makerFeeAssetAddress == trade.baseAssetAddress ||
        trade.makerFeeAssetAddress == trade.quoteAssetAddress,
      'Maker fee asset is not in trade pair'
    );
    require(
      trade.takerFeeAssetAddress == trade.baseAssetAddress ||
        trade.takerFeeAssetAddress == trade.quoteAssetAddress,
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
      trade.grossBaseQuantityInPips > 0,
      'Base quantity must be greater than zero'
    );
    require(
      trade.grossQuoteQuantityInPips > 0,
      'Quote quantity must be greater than zero'
    );
    uint64 priceInPips = trade.grossQuoteQuantityInPips.mul(10**8).div(
      trade.grossBaseQuantityInPips
    );

    bool exceedsBuyLimit = isLimitOrderType(buy.orderType) &&
      priceInPips > buy.limitPriceInPips;
    require(!exceedsBuyLimit, 'Buy order limit price exceeded');

    bool exceedsSellLimit = isLimitOrderType(sell.orderType) &&
      priceInPips < sell.limitPriceInPips;
    require(!exceedsSellLimit, 'Sell order limit price exceeded');
  }

  function validateTradeFees(Structs.Trade memory trade) private view {
    uint64 makerTotalQuantityInPips = trade.makerFeeAssetAddress ==
      trade.baseAssetAddress
      ? trade.grossBaseQuantityInPips
      : trade.grossQuoteQuantityInPips;
    require(
      getFeeBasisPoints(
        trade.makerFeeQuantityInPips,
        makerTotalQuantityInPips
      ) <= _maxTradeFeeBasisPoints,
      'Excessive maker fee'
    );

    uint64 takerTotalQuantityInPips = trade.takerFeeAssetAddress ==
      trade.baseAssetAddress
      ? trade.grossBaseQuantityInPips
      : trade.grossQuoteQuantityInPips;
    require(
      getFeeBasisPoints(
        trade.takerFeeQuantityInPips,
        takerTotalQuantityInPips
      ) <= _maxTradeFeeBasisPoints,
      'Excessive taker fee'
    );

    require(
      trade.netBaseQuantityInPips.add(
        trade.makerFeeAssetAddress == trade.baseAssetAddress
          ? trade.makerFeeQuantityInPips
          : trade.takerFeeQuantityInPips
      ) == trade.grossBaseQuantityInPips,
      'Net base plus fee is not equal to gross'
    );
    require(
      trade.netQuoteQuantityInPips.add(
        trade.makerFeeAssetAddress == trade.quoteAssetAddress
          ? trade.makerFeeQuantityInPips
          : trade.takerFeeQuantityInPips
      ) == trade.grossQuoteQuantityInPips,
      'Net quote plus fee is not equal to gross'
    );
  }

  function validateOrderSignatures(
    Structs.Order memory buy,
    Structs.Order memory sell,
    Structs.Trade memory trade
  ) private pure returns (bytes32, bytes32) {
    bytes32 buyOrderHash = validateOrderSignature(buy, trade);
    bytes32 sellOrderHash = validateOrderSignature(sell, trade);

    return (buyOrderHash, sellOrderHash);
  }

  function validateOrderSignature(
    Structs.Order memory order,
    Structs.Trade memory trade
  ) private pure returns (bytes32) {
    bytes32 orderHash = Signatures.getOrderWalletHash(
      order,
      trade.baseAssetSymbol,
      trade.quoteAssetSymbol
    );

    require(
      Signatures.isSignatureValid(
        orderHash,
        order.walletSignature,
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
      UUID.getTimestampInMsFromUuidV1(buy.nonce) >
        getLastInvalidatedTimestamp(buy.walletAddress),
      'Buy order nonce timestamp too low'
    );
    require(
      UUID.getTimestampInMsFromUuidV1(sell.nonce) >
        getLastInvalidatedTimestamp(sell.walletAddress),
      'Sell order nonce timestamp too low'
    );
  }

  function validateWithdrawalSignature(Structs.Withdrawal memory withdrawal)
    private
    pure
    returns (bytes32)
  {
    bytes32 withdrawalHash = Signatures.getWithdrawalWalletHash(withdrawal);

    require(
      Signatures.isSignatureValid(
        withdrawalHash,
        withdrawal.walletSignature,
        withdrawal.walletAddress
      ),
      'Invalid wallet signature'
    );

    return withdrawalHash;
  }

  // Asset registry //

  /**
   * @dev Initiate registration process for a token asset. Only ERC-20 tokens can be added - ETH is
   * hardcoded in the registry
   */
  function registerToken(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    _assetRegistry.registerToken(tokenAddress, symbol, decimals);
    emit TokenRegistered(tokenAddress, symbol, decimals);
  }

  /**
   * @dev Finalize registration process for a token asset. All parameters must exactly match a previous
   * call to `registerAsset`
   */
  function confirmTokenRegistration(
    address tokenAddress,
    string calldata symbol,
    uint8 decimals
  ) external onlyAdmin {
    _assetRegistry.confirmTokenRegistration(tokenAddress, symbol, decimals);
    emit TokenRegistrationConfirmed(tokenAddress, symbol, decimals);
  }

  function loadAssetBySymbol(string calldata assetSymbol, uint64 timestampInMs)
    external
    view
    returns (Structs.Asset memory)
  {
    return _assetRegistry.loadAssetBySymbol(assetSymbol, timestampInMs);
  }

  // Dispatcher whitelisting //

  /**
   * @dev Sets the wallet whitelisted to dispatch transactions invoking the `executeTrade` and `withdraw` functions
   */
  function setDispatcher(address newDispatcherWallet) external onlyAdmin {
    require(newDispatcherWallet != address(0x0), 'Invalid wallet address');
    require(
      newDispatcherWallet != _dispatcherWallet,
      'Must be different from current dispatcher'
    );
    address oldDispatcherWallet = _dispatcherWallet;
    _dispatcherWallet = newDispatcherWallet;

    emit DispatcherChanged(oldDispatcherWallet, newDispatcherWallet);
  }

  function removeDispatcher() external onlyAdmin {
    emit DispatcherChanged(_dispatcherWallet, address(0x0));
    _dispatcherWallet = address(0x0);
  }

  modifier onlyDispatcher() {
    require(msg.sender == _dispatcherWallet, 'Caller is not dispatcher');
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

  function isMarketOrderType(Enums.OrderType orderType)
    private
    pure
    returns (bool)
  {
    return
      orderType == Enums.OrderType.Market ||
      orderType == Enums.OrderType.StopLoss ||
      orderType == Enums.OrderType.TakeProfit;
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
      return _nonceInvalidations[walletAddress].timestampInMs;
    }

    return 0;
  }
}
