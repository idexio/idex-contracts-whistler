<!-- markdownlint-disable MD007 -->

# Controls and Governance

## Notes

2020-04-10:

- Updated the escape hatch logic with a simplified wallet exit scheme
- Added off-chain handling requirements for both nonce invalidation and wallet exits
  
## Overview

Whistler on-chain components span three contracts, each with attendant controls and governance.

## Custodian Contract

The Custodian contract custodies user funds with minimal additional logic. Specifically, it tracks two control contract addresses:

- Exchange: the Exchange contract address is the only agent whitelisted to authorize transfers of funds out of the Custodian.
- Governance: the Governance contract address is the only agent whitelisted to authorize changing the Exchange and
Governance contract addresses within the Custodian.
  
The Custodian has no control logic itself beyond the above authorizations. Its logic is limited by design to maximize
future upgradability without requiring fund migration.

## Governance Contract

The Governance contract implements the contract upgrade logic while enforcing governance constraints.

- The Governance contract has a single owner, and the owner cannot be changed.
- The Governance contract has a single admin, and the admin can be changed with no delay by the owner.
- The admin is the only agent whitelisted to change the Custodian’s Exchange or Governance contract addresses, but the
change is a two-step process.
- - The admin first calls an upgrade authorization with the new contract address, which initiates the Contract Upgrade
Period.
- - Once the Contract Upgrade Period expires, the admin can make a second call that completes the change to the new
contract address.
- At any time during the Contract Upgrade Period, the admin can cancel the upgrade immediately.

### Tunable Parameters

- Admin Change Period: immediate
- Contract Upgrade Period: 1 week
- Contract Upgrade Cancellation Period: immediate
  
## Exchange Contract

The Exchange contract implements the majority of exchange functionality, including wallet asset balance tracking. As
such, it contains several fine-grained control and protection mechanisms:

- The Exchange contract has a single owner, and the owner cannot be changed.
- The Exchange contract has a single admin, and the admin can be changed with no delay by the owner.
- The admin can add or remove addresses as Dispatch wallets with no delay. Dispatch wallets are authorized to call
operator-only contract functions, eg trade.
- The Exchange contract tracks a single fee wallet address, and the fee wallet can be changed with no delay by the admin.
- Nonce invalidation (i.e. mining cancels) is user-initiated rather than operator-initiated, as is the case in IDEX 1.0.
- - User calls a function on Exchange with a nonce before which all orders should be invalidated.
- - The Exchange records the invalidation, and starts enforcing it in the trade function after the Chain Propagation Period.
- - Off-chain, on detecting the nonce invalidation transaction, all open orders prior to the target nonce for the wallet
are cancelled.
- Wallet exits (i.e. escape hatch) are user-initiated, and both permanently blacklist the target wallet and subsequently
allow the user to directly withdraw any balances.
- - User calls the exit function on the Exchange.
- - The Exchange permanently records the exit and block number, which initiates the Chain Propagation Period.
- - Once the Chain Propagation Period expires:
- - - The Exchange Contract blocks any deposits, trades, or dispatch withdrawals for the wallet.
- - - The Exchange Contract allows the user to initiate withdrawal transactions for any wallet balances remaining on the Exchange.
- - Off-chain, on detecting the wallet exit transaction:
- - - All Core Actions are disabled for the wallet.
- - - The wallet is marked as exited, which prevents re-enabling any of the Core Actions.
- - - All open orders are cancelled for the wallet.
- The admin can change the Chain Propagation Period with no delay, subject to the Minimum Chain Propagation Period and
Maximum Chain Propagation Period limits.
- Fee maximums are enforced by the Exchange and specified by the Maximum Maker Fee Rate, Maximum Taker Fee Rate, and
Maximum Withdrawal Fee Rate, all defined as percentages. Fee Rate limits are not changeable.

### Tunable Parameters

- Admin Change Period: immediate
- Dispatch Change Period: immediate
- Fee Change Period: immediate
- Chain Propagation Period: 1 hour
- Minimum Chain Propagation Period: 0
- Maximum Chain Propagation Period: 1 week
- Chain Propagation Change Period: immediate
- Maximum Maker Fee Rate: 10%
- Maximum Taker Fee Rate: 10%
- Maximum Withdrawal Fee Rate: 10%
