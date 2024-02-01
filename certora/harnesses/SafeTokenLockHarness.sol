// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    address public SAFE_TOKEN_ADDRESS;
    struct User {
        uint96 locked; // Contains the total locked token by a particular user.
        uint96 unlocked; // Contains the total unlocked token by a particular user.
        uint32 unlockStart; // Zero or ID of Oldest unlock operation created which is yet to be withdrawn.
        uint32 unlockEnd; // Next unlock Id = unlockEnd++
    }
    struct UnlockInfo {
        uint96 amount; // For 1 Billion Safe Tokens, this is enough. 10 ** 27 < 2 ** 96
        uint64 unlockedAt; // Valid until Year: 2554.
    }

    mapping(address => User) public users; // Contains the address => user info struct.
    mapping(uint32 => mapping(address => UnlockInfo)) public unlocks; // Contains the Unlock index => user => Unlock Info struct.

    // harnessed getter function
    function getUser(address userAddress) external returns (User memory) {
        return users[userAddress];
    }

    function getUserUnlock(address userAddress, uint32 index) external returns (UnlockInfo memory) {
        return unlocks[index][userAddress];
    }

    function getSafeTokenAddress() external view returns (address) {
        return SAFE_TOKEN_ADDRESS;
    }
}
