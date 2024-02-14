// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

library User {
    type Data is uint256;

    error Overflow();

    function pack(uint256 locked, uint256 unlocked, uint256 unlockStart, uint256 unlockEnd) internal pure returns (Data user) {
        unchecked {
            if (((locked | unlocked) >> 96) | ((unlockStart | unlockEnd) >> 32) != 0) {
                revert Overflow();
            }

            user = Data.wrap((locked << 160) | (unlocked << 64) | (unlockStart << 32) | unlockEnd);
        }
    }

    function unpack(Data user) internal pure returns (uint256 locked, uint256 unlocked, uint256 unlockStart, uint256 unlockEnd) {
        unchecked {
            locked = Data.unwrap(user) >> 160;
            unlocked = (Data.unwrap(user) << 96) >> 160;
            unlockStart = (Data.unwrap(user) << 192) >> 224;
            unlockEnd = Data.unwrap(user) & 0xffff;
        }
    }

    function lock(Data user, uint256 amount) internal pure returns (Data) {
        if (amount >> 96 != 0) {
            revert Overflow();
        }
        return Data.wrap(Data.unwrap(user) + (amount << 160));
    }
}
