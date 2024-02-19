// SPDX-License-Identifier: LGPL-3.0-only
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Dummy contract for writing formal verification rules
contract SafeToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}
