<!-- markdownlint-disable MD033 -->
# <img src="assets/logo.png" alt="IDEX" height="36px" valign="top"> Smart Contracts

![Tests](./assets/tests.svg)
![Lines](./assets/coverage-lines.svg)
![Branches](./assets/coverage-branches.svg)
![Functions](./assets/coverage-functions.svg)
![Statements](./assets/coverage-statements.svg)

![Discord](https://img.shields.io/discord/455246457465733130?label=Discord&style=flat-square)
![GitHub](https://img.shields.io/github/license/idexio/idex-contracts?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/idexio/idex-sdk-js?style=flat-square)

![Twitter Follow](https://img.shields.io/twitter/follow/idexio?style=social)

## Overview

This repo collects source code, tests, and documentation for the IDEX Whistler release Ethereum contracts.

## Install

Download and install  [nvm](https://github.com/nvm-sh/nvm#installing-and-updating),
[yarn](https://classic.yarnpkg.com/en/docs/install), and [python3](https://www.python.org/downloads/). Then:

```console
pip3 install slither-analyzer
```

## Usage

This repo is setup as a [Truffle](https://www.trufflesuite.com/docs/truffle/overview) project, with library and test
code written in Typescript. To build:

```console
nvm use
yarn && yarn build
```

To run test suite, generate coverage report, and perform static analysis:

```console
yarn coverage
yarn analyze
```

## Background

IDEX is in development on a series of major product releases that together comprise IDEX 2.0.

- Release 1 (Whistler): The Whistler release contains all of the off-chain upgrades of IDEX 2.0, including new web and
mobile UIs, new REST and WS APIs, and a high-performance in-memory trading engine that supports advanced order types.
Whistler also includes new smart contracts that custody funds and settle trades on-chain. Unlike later releases, the
Whistler smart contracts are structurally similar to the [IDEX 1.0 contract](https://etherscan.io/address/0x2a0c0dbecc7e4d658f48e01e3fa353f44050c208#code
) design in that each trade results in a single layer-1 transaction to update the on-contract balances.
  
- Release 2 (Peak2Peak): An original layer-2 scaling solution, known as Optimized Optimistic Rollup (O2R), is part of
the larger IDEX 2.0 initiative. Unlike the Whistler contracts, the O2R contracts roll individual trades up into
periodic Merkle root state summaries that are published to layer 1. The Peak2Peak release launches the O2R smart
contracts and accompanying infrastructure to run in parallel with the Whistler smart contracts. During P2P, the Whistler
contracts continue to settle trades and maintain the canonical wallet balances. Running the O2R contracts in parallel
allows testing on real workloads and tuning system parameters prior to switching to O2R exclusively.
  
- Release 3 (Blackcomb): The Blackcomb release switches settlement and balance tracking from the Whistler contracts to
the O2R layer-2 system.
  
This documentation covers a security audit for the Whistler smart contracts only, with O2R contract audits to follow.

## Contract Structure

The Whistler on-chain infrastructure includes three main contracts and a host of supporting libraries.

- Custodian: custodies user funds with minimal additional logic.
- Governance: implements [upgrade logic](#upgradability) while enforcing [governance constraints](#controls-and-governance).
- Exchange: implements the majority of exchange functionality, including wallet asset balance tracking.

## User Interaction Lifecycle

Whistler supports trading Ethereum and ERC-20 tokens, and requires users to deposit Eth and tokens into the Whistler
smart contracts before trading. The interaction lifecycle spans three steps.

### Deposit

Users must deposit funds into the Whistler contracts before they are available for trading on IDEX. Depositing BNB
requires calling `depositEther` on the Exchange contract; depositing tokens requires an `approve` call on the
token contract itself before calling `depositTokenByAddress` on the Exchange contract.

- The `depositEther` and `depositTokenByAddress` are functions on the Exchange contract, but the funds are ultimately
held in the Custody contract. As part of the deposit process, tokens are transferred first to the Exchange contract,
which tracks wallet asset balances, and then transferred again to the Custody contract. Separate exchange logic and fund
custody supports IDEX 2.0’s [upgrade design](#upgradability).
  
- Deposits are only allowed for [registered tokens](#token-symbol-registry).
  
- Deposit amounts are adjusted to IDEX 2.0’s [normalized precision design](#precision-and-pips) to prevent depositing
any dust.
  
- Deposits from [exited wallets](#wallet-exits) are rejected.
  
### Trade

In Whistler, all order management and trade matching happens off-chain while trades are ultimately settled on-chain. A
trade is considered settled when the Exchange contract’s wallet asset balances reflect the new values agreed to in the
trade. Exchange’s `executeTrade` function is responsible for settling trades.

- Unlike deposits, trade settlement can only be initiated via a whitelisted Dispatch wallet controlled by IDEX. Users do
not settle trades directly; only IDEX can submit trades for settlement. Because IDEX alone controls dispatch, IDEX’s
off-chain components can guarantee eventual on-chain trade settlement order and thus allow users to trade in real-time
without waiting for dispatch or mining.
  
- The primary responsibility of the trade function is order and trade validation. In the case that IDEX off-chain
infrastructure is compromised, the validations ensure that funds can only move in accordance with orders signed by the
depositing wallet.
  
- Due to business requirements, orders are specified by symbol, eg "UBT-BNB" rather than by token contract addresses.
A number of validations result from the [token symbol registration system](#token-symbol-registry). Note the `trade`
parameter to the `executeTrade` function includes the symbol strings separately. This is a gas optimization to order
signature verification as string concat is cheaper than split.
  
- Due to business requirements, order quantity and price are specified as strings in
[PIP precision](#precision-and-pips), hence the need for order signature validation to convert the provided values
to strings.
  
- IDEX 2.0 supports partial fills on orders, which requires additional bookkeeping to prevent overfills and replays.
  
- Fees are assessed as part of trade settlement. The off-chain trading engine computes fees, but the trade function is
responsible for enforcing that fees are within previously defined limits. Business rules require that makers and takers
are charged different fees. Fees are deducted from the quantity of asset each party is receiving.
  
### Withdraw

Similar to trade settlement, withdrawals are initiated by users via IDEX’s off-chain components, but calls to the
Exchange contract’s `withdraw` function are restricted to whitelisted Dispatch wallets. `withdraw` calls are limited to the
Dispatch wallet in order to guarantee the balance update sequence and thus support trading ahead of settlement. There
is also a [wallet exit](#wallet-exits)
mechanism to prevent withdrawal censorship by IDEX.

- Withdrawals may be requested by asset symbol or by token contract address. Withdrawal by asset symbol is the standard
approach as dictated by business rules and requires a lookup of the token contract address in the
[token symbol registry](#token-symbol-registry). Withdrawal by token contract asset exists to cover the case where an
asset has been relisted under the same symbol, for example in the case of a token swap.
  
- IDEX collects fees on withdrawals in order to cover the gas costs of the `withdraw` function call. Because only an
IDEX-controlled Dispatch wallet can make the `withdraw` call, IDEX is the immediate gas payer for user withdrawals.
IDEX passes along the estimated gas costs to users by collecting a fee out of the withdrawn amount.
  
- Despite the `withdraw` function being part of the Exchange contract, funds are returned to the user’s wallet from the
Custody contract.
  
## Upgradability

Upon the Whistler release, IDEX users must withdraw funds from the IDEX 1.0 contract and deposit funds into the Whistler
contract to continue trading. For an improved UX going forward, Whistler’s contracts include upgrade logic that enables
the rollout of the subsequent Blackcomb release without requiring users to withdraw and redeposit funds into a new
Custody contract. The upgrade logic is minimalist by design.

- The Custody contract tracks the Governance contract and Exchange contract. The Governance contract is the only actor
authorized to change the Custody contract’s Governance or Exchange target, and implements the rules under which such
changes may be made.
  
- Exchange state data is stored in the Exchange contract itself. Because state data, such as wallet asset balances, is
not held in an external contract, any upgrade to the Exchange contract requires actively migrating the state data to the
upgraded contract.
  
- The anticipated target of the upgrade is the Blackcomb release’s O2R layer-2 system, where the Exchange state data will
be moved off chain going forward.
  
## Controls and Governance

The Whistler controls and governance design is captured in its own [spec](./GOVERNANCE.md).

## Additional Mechanics

### Token Symbol Registry

Business rules require orders to be specified in asset symbol terms rather than token contract address terms. For
example, an order specifies the market as `"UBT-BNB"` rather than `{ "base": "0xb705268213d593b8fd88d3fdeff93aff5cbdcfae",
"quote": "0x0" }`. Deposits, withdrawals and asset balance tracking, however, must be implemented in token contract
address terms. In order to support both usage modes, Whistler includes a token registry that maps symbols to token contract
addresses along with additional token metadata, such as precision. Only registered tokens are accepted for deposit.

- Token registration is a two-transaction process, requiring separate calls to `registerToken` and `confirmTokenRegistration`.
Two steps reduce the likelihood of data entry errors when registering a new token.
  
- Occasionally projects upgrade their token address via a token swap but need to retain the same trading symbol. To
support this use case, the token registration mechanism can track multiple token contract addresses for a symbol. The
registry includes registration time stamps to ensure orders and withdrawals are only executed against the intended
token contract address, as validated against the order or withdrawal [nonce](#nonces-and-invalidation). Off-chain
business process rules ensure orders are not accepted during new token registration of the same symbol to prevent race
conditions.
  
### Precision and Pips

In its off-chain components, IDEX 2.0 normalizes all assets to a maximum of 8 decimals of precision, with 1e-8 referred
to as a "pip". Because deposit and withdrawals must account for the true token precision, however, the token registry
includes token decimals as well as functions to convert `pipsToAssetUnits` and `assetUnitsToPips`. All wallet asset
balances are tracked in pips.

### Nonces and Invalidation

Orders include nonces to prevent replay attacks. IDEX 2.0 uses [version-1 UUIDs](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_1_(date-time_and_MAC_address))
as nonces, which include a timestamp as part of the value.

IDEX’s hybrid off-chain/on-chain architecture is vulnerable to a cancelled-order submission attack if the off-chain
components are compromised. In this scenario, an attacker gains access to the Dispatch wallet and a set of cancelled
orders by compromising the off-chain order book. Because the orders themselves include valid signatures from the
placing wallet, the Whistler contract cannot distinguish between active orders placed by users and those the user has
since cancelled.

Nonce invalidation via `invalidateOrderNonce` allows users to invalidate all orders prior to a specified nonce, making it
impossible to submit those orders in a subsequent cancelled-order submission attack. The
[controls and governance](#controls-and-governance) spec covers the exact mechanics and parameters of the mechanism.

### Wallet Exits

Whistler includes a wallet exit mechanism, which allows users to withdraw funds in the case IDEX is offline or
maliciously censoring withdrawals. Calling `exitWallet` initiates the exit process, which prevents
the wallet from subsequent deposits, trades, or normal withdrawals. Wallet exits are a two-step process as defined in
[controls](#controls-and-governance).

## License

The IDEX Whistler Smart Contracts and related code are released under the [GNU Lesser General Public License v3.0](https://www.gnu.org/licenses/lgpl-3.0.en.html).
