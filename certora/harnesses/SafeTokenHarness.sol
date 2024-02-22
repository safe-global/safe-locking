// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0 <0.9.0;

import {SafeToken} from "../../contracts/test/SafeToken.sol";

contract SafeTokenHarness is SafeToken {
    constructor(address owner) SafeToken(owner) {}
}
