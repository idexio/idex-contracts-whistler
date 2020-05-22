// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import { UUID } from '../libraries/UUID.sol';


contract UUIDMock {
  function getTimestampInMsFromUuidV1(uint128 uuid)
    external
    pure
    returns (uint64)
  {
    return UUID.getTimestampInMsFromUuidV1(uuid);
  }
}
