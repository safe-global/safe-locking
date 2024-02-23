# SafeTokenLock Implementation Details

## Pseudocode

```solidity
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import { ISafeTokenLock } from './interfaces/ISafeTokenLock.sol';

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock {
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

  address public immutable SAFE_TOKEN; // = Safe Token Address.
  uint64 public immutable COOLDOWN_PERIOD; // Contains the cooldown period.
  mapping(address => User) public users; // Contains the address => user info struct.
  mapping(uint32 => mapping(address => UnlockInfo)) public unlocks; // Contains the Unlock index => user => Unlock Info struct.

  constructor(address safeToken, uint32 cooldownPeriod) {
    SAFE_TOKEN = safeTokenAddress; // Safe Token Contract Address
    COOLDOWN_PERIOD = cooldownPeriod; // Cooldown period
  }

  // @inheritdoc ISafeTokenLock
  function lock(uint96 amount) external {
    /**
        1. Cautionary check that the `amount` > zero
        2. `transferFrom` caller (Caller should `approve` in advance).
        3. Update the locked amount of that particular user in `users[caller].locked`.
        4. Emit the Event.

        Gas Usage (major usage only): Token Transfer + SLOAD users[caller] + SSTORE users[caller] + Emit Event
    */
  }

  // @inheritdoc ISafeTokenLock
  function unlock(uint96 amount) external returns (uint32 index) {
    /**
        1. Read the `users[caller]` to `User memory user`.
        2. Check if the `user[caller].locked` >= `amount`
        3. Assign `UnlockInfo` struct with details of `(amount, timestampOfUnlock`)` to `user[caller].unlockEnd` in `unlocks`.
        4. Update the `users[caller]` with (user[caller].locked - amount, user[caller].unlocked + amount, user[caller].unlockStart, user[caller].unlockEnd++).
        5. Emit the Event.

        Gas Usage (major usage only): SLOAD & STORE users[caller] + SSTORE UnlockInfo + Emit Event
    */
  }

  // @inheritdoc ISafeTokenLock
  function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
    /**
        1. Read the `users[caller]` to `User memory user`.
        2. Based on the passed maxUnlocks, decide on the `unlockEnd`.
        3. For i = `user[caller].unlockStart`, i < `unlockEnd`:
            3.1 Read `unlocks[i][caller]` to `UnlockInfo memory unlockInfo`.
            3.2 Check if `unlockInfo.unlockedAt > block.timestamp`. If yes, break. Else continue:
                3.2.1 Add `unlockInfo.amount` to `amount`.
                3.2.2 Emit the event.
                3.2.3 Clear out unlocks[i][caller]
        4. If `amount` > 0:
          4.1 Update `users[caller]` to `(locked as same, unlocked - amount, unlockStart = i, unlockEnd as same)`
          4.2 Transfer `amount` to `caller`.

        Gas Usage (major usage only): SLOAD users[caller] + n SLOAD unlocks[i][caller] + n Event Emits + n Zero assignment SSTORE unlocks[i][caller] + SSTORE users[caller] + Token Transfer
        where n can be as high as `unlockEnd - unlockStart`.
    */
  }

  // @inheritdoc ISafeTokenLock
  function userTokenBalance(address holder) external returns (uint96 amount) {
    /**
        Return the amount from `users[caller].locked` + `users[caller].unlocked`.

        Gas Usage: As this is a view function, gas usage is not considered.
    */
  }
}
```

## State Change Example

### Initial State

```solidity
users[A] = (0, 0, 0, 0)
users[B] = (0, 0, 0, 0)
unlocks[0][A] = (0, 0)
unlocks[1][A] = (0, 0)
unlocks[2][A] = (0, 0)
unlocks[0][B] = (0, 0)
unlocks[1][B] = (0, 0)
```

### Operations

| User | Operation | Time | Amount | users[User]      | unlocks[index][User]                            | Note                                         |
| ---- | --------- | ---- | ------ | ---------------- | ----------------------------------------------- | -------------------------------------------- |
| A    | Lock      |      | 250    | (250, 0, 0, 0)   |                                                 |                                              |
| A    | Unlock    |      | 20     | (230, 20, 0, 1)  | unlocks[0][A] → (20, t1)                        |                                              |
| B    | Lock      |      | 20 0   | (200, 0, 0, 0)   |                                                 |                                              |
| A    | Unlock    |      | 50     | (180, 70, 0, 2)  | unlocks[1][A] → (50, t2)                        |                                              |
| B    | Unlock    |      | 35     | (165, 35, 0, 1)  | unlocks[0][B] → (35, t2)                        |                                              |
| A    | Unlock    |      | 70     | (110, 140, 0, 3) | unlocks[2][A] → (70, t2)                        |                                              |
| A    | Withdraw  | t1   |        | (110, 120, 1, 3) | unlocks[0][A] → (0, 0)                          |                                              |
| B    | Unlock    |      | 75     | (90, 110, 0, 2)  | unlocks[1][B] → (75, t3)                        |                                              |
| A    | Withdraw  | t2   |        | (110, 0, 3, 3)   | unlocks[2][A] → (0, 0) & unlocks[3][A] → (0, 0) | Here 2 withdraw happens, as time t2 reached. |
| B    | Withdraw  |      |        | (90, 75, 1, 2)   | unlocks[0][B] → (0, 0)                          |                                              |

### Final State

```solidity
users[A] = (110, 0, 3, 3)
users[B] = (90, 75, 1, 2)
unlocks[0][A] = (0, 0)
unlocks[1][A] = (0, 0)
unlocks[2][A] = (0, 0)
unlocks[0][B] = (0, 0)
unlocks[1][B] = (75, t3)
```

## Note

- `unlocks[index][caller]` will only be zeroed based on the gas usage check.
