// SPDX-License-Identifier: LGPL-3.0-only
import {SafeToken} from "safe-token/contracts/SafeToken.sol";

// Dummy contract for writing formal verification rules
contract SafeTokenHarness is SafeToken {
    constructor(address owner) SafeToken(owner) {}
}
