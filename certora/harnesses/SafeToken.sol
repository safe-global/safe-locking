// SPDX-License-Identifier: LGPL-3.0-only

// Dummy contract for writing formal verification rules
contract SafeToken {
    function balanceOf(address) external returns (uint256) {
        return 0;
    }
}