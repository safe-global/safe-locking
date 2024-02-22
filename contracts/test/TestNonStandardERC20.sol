// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0 <0.9.0;

contract TestNonStandardERC20 {
    enum Behaviour {
        RETURN_FALSE_ON_FAILURE,
        RETURN_NOTHING_ON_SUCCESS
    }

    Behaviour public immutable BEHAVIOUR;

    constructor(Behaviour behaviour) {
        BEHAVIOUR = behaviour;
    }

    function transfer(address, uint256) external view {
        if (BEHAVIOUR == Behaviour.RETURN_FALSE_ON_FAILURE) {
            // solhint-disable-next-line no-inline-assembly
            assembly ("memory-safe") {
                mstore(0, 0)
                return(0, 32)
            }
        } else if (BEHAVIOUR == Behaviour.RETURN_NOTHING_ON_SUCCESS) {
            return;
        } else {
            revert("not implemented");
        }
    }
}
