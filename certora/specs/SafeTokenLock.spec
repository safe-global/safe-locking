using SafeToken as safeTokenContract;

methods {
    function COOLDOWN_PERIOD() external returns (uint64) envfree;
    function getUnlock(address userAddress, uint32 index) external returns (SafeTokenLock.UnlockInfo memory) envfree;
    function getUser(address userAddress) external returns (SafeTokenLock.User memory) envfree;
    function owner() external returns (address) envfree;
    function pendingOwner() external returns (address) envfree;
    function totalBalance(address holder) external returns (uint96) envfree;

    function getUnlockSum(address holder) external returns (uint256) envfree;
    function getMinUnlockAmount(address holder) external returns (uint256) envfree;
    function getLastUnlockTimestamp(address holder) external returns (int256) envfree;

    function SafeToken.balanceOf(address account) external returns (uint256) envfree;
    function SafeToken.paused() external returns (bool) envfree;
    function SafeToken.totalSupply() external returns (uint256) envfree;

    function _.transfer(address, uint256) external => NONDET UNRESOLVED;
}

invariant unlockStartBeforeEnd(address holder)
    getUser(holder).unlockStart <= getUser(holder).unlockEnd;

invariant unlockedIsSumOfUnlockAmounts(address holder)
    to_mathint(getUser(holder).unlocked) == to_mathint(getUnlockSum(holder))
    {
        preserved {
            requireInvariant unlockStartBeforeEnd(holder);
        }
    }

rule getUserNeverReverts() {
    address holder;
    getUser@withrevert(holder);
    assert !lastReverted;
}

rule getUnlockNeverReverts() {
    address holder;
    uint32 index;
    getUnlock@withrevert(holder, index);
    assert !lastReverted;
}

rule getUnlockSumNeverReverts() {
    address holder;
    getUnlockSum@withrevert(holder);
    assert !lastReverted;
}

definition MAX_UINT32() returns mathint = 2^32 - 1;
definition MAX_UINT64() returns mathint = 2^64 - 1;
definition TOTAL_SUPPLY() returns mathint = 10^27;

rule canAlwaysUnlock() {
    env e;
    uint96 amount;

    SafeTokenLock.User userBefore = getUser(e.msg.sender);

    require e.block.timestamp + COOLDOWN_PERIOD() <= MAX_UINT64();
    require userBefore.unlockEnd + 1 <= MAX_UINT32();
    require userBefore.locked + userBefore.unlocked <= safeToken.totalSupply();

    unlock@withrevert(e, amount);

    if (e.msg.value == 0 && amount > 0 && amount <= userBefore.locked) {
        assert !lastReverted;
    } else {
        assert lastReverted;
    }
}

rule allLockedGetUnlocked(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    SafeTokenLock.User userBefore = getUser(e.msg.sender);
    f(e, arg);
    SafeTokenLock.User userAfter = getUser(e.msg.sender);

    assert userBefore.locked > userAfter.locked
        => userBefore.locked - userAfter.locked
            == userAfter.unlocked - userBefore.unlocked;
}

rule onlyHolderCanChangeBalance(address holder, method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    SafeTokenLock.User userBefore = getUser(holder);
    f(e, arg);
    SafeTokenLock.User userAfter = getUser(holder);

    assert userBefore.locked != userAfter.locked || userBefore.unlocked != userAfter.unlocked
        => e.msg.sender == holder;
}

rule ownerCanAlwaysTransferOwnership(address newOwner) {
    env e;

    require e.msg.sender == owner();
    require e.msg.value == 0;

    transferOwnership@withrevert(e, newOwner);

    assert !lastReverted;
    assert owner() == e.msg.sender;
    assert pendingOwner() == newOwner;
}

rule pendingOwnerCanAlwaysAcceptOwnership() {
    env e;

    require e.msg.sender == pendingOwner();
    require e.msg.value == 0;

    acceptOwnership@withrevert(e);

    assert !lastReverted;
    assert owner() == e.msg.sender;
    assert pendingOwner() == 0;
}

rule ownerCanAlwaysRenounceOwnership() {
    env e;

    require e.msg.sender == owner();
    require e.msg.value == 0;

    renounceOwnership@withrevert(e);

    assert !lastReverted;
    assert owner() == 0;
    assert pendingOwner() == 0;
}

rule onlyOwnerOrPendingOwnerCanChangeOwner(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    address pendingOwnerBefore = pendingOwner();
    address ownerBefore = owner();

    f(e, arg);

    assert owner() != ownerBefore
        => e.msg.sender == ownerBefore || e.msg.sender == pendingOwnerBefore;
}

rule onlyOwnerOrPendingOwnerCanChangePendingOwner(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    address pendingOwnerBefore = pendingOwner();
    address ownerBefore = owner();

    f(e, arg);

    assert pendingOwner() != pendingOwnerBefore
        => e.msg.sender == ownerBefore || e.msg.sender == pendingOwnerBefore;
}

invariant unlocksHaveNonZeroAmounts(address holder)
    getMinUnlockAmount(holder) > 0;

invariant unlocksAreOrdered(address holder)
    getLastUnlockTimestamp(holder) >= 0
    {
        preserved with (env e) {
            requireInvariant unlocksHaveNonZeroAmounts(holder);
            require to_mathint(e.block.timestamp) >= to_mathint(getLastUnlockTimestamp(holder));
            require e.block.timestamp + COOLDOWN_PERIOD() <= MAX_UINT64();
        }
    }

rule getLastUnlockTimestampNeverReverts() {
    address holder;
    getLastUnlockTimestamp@withrevert(holder);
    assert !lastReverted;
}

rule getLastUnlockTimestampReturnsLastUnlockTimestamp(method f, address holder) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    int256 lastUnlockTimestampBefore = getLastUnlockTimestamp(holder);
    require to_mathint(e.block.timestamp) >= to_mathint(lastUnlockTimestampBefore);

    f(e, arg);

    int256 lastUnlockTimestampAfter = getLastUnlockTimestamp(holder);

    if (f.selector == sig:unlock(uint96).selector && e.msg.sender == holder) {
        assert to_mathint(lastUnlockTimestampAfter) == to_mathint(e.block.timestamp);
    } else if (f.selector == sig:withdraw(uint32).selector && e.msg.sender == holder) {
        assert lastUnlockTimestampAfter == lastUnlockTimestampBefore
            || lastUnlockTimestampAfter == 0;
    } else {
        assert lastUnlockTimestampBefore == lastUnlockTimestampAfter;
    }
}

invariant addressZeroCannotLock()
    totalBalance(0) == 0;

invariant safeTokenSelfBalanceIsZero()
    safeTokenContract.balanceOf(safeTokenContract) == 0;

invariant safeTokenCannotLock()
    totalBalance(safeTokenContract) == 0
    {
        preserved {
            requireInvariant safeTokenSelfBalanceIsZero();
        }
    }

rule canAlwaysWithdrawEverythingAfterCooldownPeriod() {
    env e;

    requireInvariant unlockStartBeforeEnd(e.msg.sender);
    requireInvariant unlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant unlocksAreOrdered(e.msg.sender);
    requireInvariant unlocksHaveNonZeroAmounts(e.msg.sender);
    requireInvariant addressZeroCannotLock();
    requireInvariant safeTokenCannotLock();
    require e.msg.value == 0;
    require to_mathint(e.block.timestamp)
        >= getLastUnlockTimestamp(e.msg.sender) + COOLDOWN_PERIOD();
    require !safeTokenContract.paused();

    // TODO(nlordell): These should be invariants
    require to_mathint(safeTokenContract.balanceOf(currentContract))
        >= to_mathint(totalBalance(e.msg.sender));
    require safeTokenContract.balanceOf(e.msg.sender) + safeTokenContract.balanceOf(currentContract)
        <= to_mathint(safeTokenContract.totalSupply());

    SafeTokenLock.User userBefore = getUser(e.msg.sender);

    uint256 amount = withdraw@withrevert(e, 0);
    assert !lastReverted;

    SafeTokenLock.User userAfter = getUser(e.msg.sender);

    assert amount != 0
        => userBefore.unlockStart != userBefore.unlockEnd;
    assert to_mathint(userBefore.unlocked) == to_mathint(amount);
    assert userAfter.unlocked == 0;
    assert userAfter.unlockStart == userAfter.unlockEnd;
    assert userAfter.unlockEnd == userBefore.unlockEnd;
}
