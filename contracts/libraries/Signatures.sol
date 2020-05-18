// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { ECDSA } from '@openzeppelin/contracts/cryptography/ECDSA.sol';

import { Enums, Structs } from './Interfaces.sol';


library Signatures {
  function isSignatureValid(
    bytes32 hash,
    bytes memory signature,
    address signer
  ) internal pure returns (bool) {
    return
      ECDSA.recover(ECDSA.toEthSignedMessageHash(hash), signature) == signer;
  }

  function getOrderWalletHash(
    Structs.Order memory order,
    string memory baseSymbol,
    string memory quoteSymbol,
    string memory clientOrderId
  ) internal pure returns (bytes32) {
    return
      keccak256(
        // Placing all the fields in a single `abi.encodePacked` call causes a `stack too deep` error
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
            order.quoteOrderQuantity > 0
              ? pipToDecimal(order.quoteOrderQuantity)
              : '',
            order.limitPrice > 0 ? pipToDecimal(order.limitPrice) : '',
            clientOrderId,
            order.stopPrice > 0 ? pipToDecimal(order.stopPrice) : '',
            uint8(order.selfTradePrevention),
            order.cancelAfter
          )
        )
      );
  }

  function getWithdrawalWalletHash(
    Structs.Withdrawal memory withdrawal,
    string memory withdrawalTokenSymbol
  ) internal pure returns (bytes32) {
    return
      keccak256(
        withdrawal.withdrawalType == Enums.WithdrawalType.BySymbol
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
}
