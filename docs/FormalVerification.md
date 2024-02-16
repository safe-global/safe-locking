`SafeTokenLock` Contract Invariants and Rules for Formal Verification

## Invariants

| Invariant name                                   | Description                                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contractBalanceGreaterThanSumOfLockedAndUnlocked | The Safe token balance of the contract must be always greater than sum of total locked and total unlocked tokens.                                                                                                                       |
| unlockStartLessThanUnlockEnd                     | `users` mapping stores the information about the start index and end index of the unlocks than can be withdrawn after respective cooldown period. The start index must be less than end index in case there exists any unlocked tokens. |
| totalLockedGreaterThanInvidualLock               | The value of the host variable that maintains the total sum of all currently locked tokens must be greater than individual locked value per user.                                                                                       |

## Rules

| Rule                                             | Description                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unlockTimeDoesNotChange                          | If there is an unlock entry in the unlocks mapping, call to any arbitrary function other than withdraw(uint32) should not affect the unlockAt timestamp value in the unlock entry.                           |
| doesNotAffectOtherUserBalance                    | Any action by any user must not affect the locked, unlocked value of the other user. In other words, the total balance accounted in the contract of the user not performing the action must remain the same. |
| cannotWithdrawMoreThanUnlocked                   | A user should not be able to get back more that the unlocked amount.                                                                                                                                         |
| cannotWithdrawBeforeCooldown                     | Ensure that every unlock must go through cooldown period before withdrawal                                                                                                                                   |
| contractBalanceIncreasesWhenTotalLockedIncreases | Locking contract balance increases when user locks tokens                                                                                                                                                    |
| possibleToFullyWithdraw                          | Users must be able to withdraw tokens from the contract                                                                                                                                                      |
| unlockTimestampOnlyIncreases                     | Every new unlock action's unlock time must be greater that the previous unlock request for each user                                                                                                         |
| unlockTimestampNeverZero                         | If user unlocks tokens the timestamp when the tokens can be withdrawn should be non zero                                                                                                                     |
| safeTokenBalanceDecreaseOnlyOnWithdraw           | The contract's Safe token balance cannot be decreased expect on withdrawal.                                                                                                                                  |