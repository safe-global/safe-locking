using SafeTokenHarness as safeTokenContract;

methods {
    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);
    function getUser(address holder) external returns(ISafeTokenLock.User memory) envfree;
    function getUnlock(address holder, uint32 index) external returns(ISafeTokenLock.UnlockInfo memory) envfree;

    // Harnessed functions
    function getStartAndEnd(address userAddress) external returns(uint32, uint32) envfree;

    // SafeToken functions
    function safeTokenContract.balanceOf(address) external returns(uint256) envfree;

    // Prevent SafeTokenHarness.transfer to cause HAVOC
    function _.transfer(address,uint256) external => NONDET UNRESOLVED;
}

//
ghost mapping(address => mathint) ghostUserLocks {
    init_state axiom forall address holder. ghostUserLocks[holder] == 0;
}
ghost mathint ghostTotalLocked {
    init_state axiom ghostTotalLocked == 0;
}
hook Sload uint96 value currentContract._users[KEY address user].locked STORAGE {
    require ghostUserLocks[user] == to_mathint(value);
}
hook Sstore SafeTokenLockHarness._users[KEY address user].locked uint96 value (uint96 oldValue) STORAGE {
    ghostTotalLocked = ghostTotalLocked + (value - oldValue);
    ghostUserLocks[user] = value;
}

ghost mathint ghostTotalUnlocked {
    init_state axiom ghostTotalUnlocked == 0;
}
ghost mapping(address => mathint) ghostUserUnlocks {
    init_state axiom forall address holder. ghostUserUnlocks[holder] == 0;
}
hook Sload uint96 value currentContract._users[KEY address user].unlocked STORAGE { 
    require ghostUserUnlocks[user] == to_mathint(value);
}
hook Sstore SafeTokenLockHarness._users[KEY address key].unlocked uint96 value (uint96 oldValue) STORAGE {
    ghostTotalUnlocked = ghostTotalUnlocked + (value - oldValue);
    ghostUserUnlocks[key] = value;
}

// Verify that for no operations on the Safe token locking contract done by user
// A can affect the Safe token balance of user B
rule doesNotAffectOtherUserBalance(method f) filtered {
    f -> !f.isView
} {
    env e;  
    address otherUser;
    calldataarg args;

    require (e.msg.sender != otherUser);
    uint96 otherUserBalanceBefore = userTokenBalance(e, otherUser);

    f(e,args);

    assert userTokenBalance(e, otherUser) == otherUserBalanceBefore;
}

// Verify that withdrawal cannot increase the balance of a user more than the
// their total unlocked amount, that is, it is impossible to withdraw tokens
// without having previously unlocked them.
rule cannotWithdrawMoreThanUnlocked() {
    env e;

    uint256 balanceBefore = safeTokenContract.balanceOf(e.msg.sender);
    mathint unlockedBefore = getUser(e.msg.sender).unlocked;

    withdraw(e, _);

    uint256 balanceAfter = safeTokenContract.balanceOf(e.msg.sender);
    assert to_mathint(balanceAfter) <= balanceBefore + unlockedBefore;
}

// Verify that unlock tokens can only be withdrawn once they mature.
rule cannotWithdrawBeforeCooldown() {
    env e;

    ISafeTokenLock.UnlockInfo unlock = getUnlock(e.msg.sender, getUser(e.msg.sender).unlockStart);

    uint96 amountWithdrawn = withdraw(e, _);

    assert to_mathint(e.block.timestamp) < to_mathint(unlock.unlockedAt)
        => amountWithdrawn == 0;
}

// Verify that it is impossible for a user to modify the time at which their
// unlock matures and can be withdrawn.
rule unlockTimeDoesNotChange(method f) {
    env e;
    calldataarg args;

    address holder;
    ISafeTokenLock.User userBefore = getUser(holder);
    uint32 index = userBefore.unlockStart;
    ISafeTokenLock.UnlockInfo unlockBefore = getUnlock(holder, index);

    require userBefore.unlockStart < userBefore.unlockEnd;
    // TODO: This `require` should be `requireInvariant` once it gets added.
    require unlockBefore.amount > 0;

    f(e, args);

    ISafeTokenLock.User userAfter = getUser(holder);
    ISafeTokenLock.UnlockInfo unlockAfter = getUnlock(holder, index);

    assert userAfter.unlockStart == userBefore.unlockStart
        => unlockAfter.unlockedAt == unlockBefore.unlockedAt;
    assert userAfter.unlockStart != userBefore.unlockStart
        => unlockAfter.unlockedAt == 0;
}

// Verify that it is always possible to, given an initial state with some
// locked token amount, to fully withdraw the entire locked balance.
// **Currently this is a "satisfy" rule which is very weak, and will change in
// a future PR**.
rule possibleToFullyWithdraw(address sender, uint96 amount) {
    env eL; // env for lock
    env eU; // env for unlock
    env eW; // env for withdraw
    uint256 balanceBefore = safeTokenContract.balanceOf(sender);
    require eL.msg.sender == sender;
    require eU.msg.sender == sender;
    require eW.msg.sender == sender;

    require amount > 0;
    lock(eL, amount);

    uint96 unlockAmount;
    require unlockAmount <= amount;

    unlock(eU, unlockAmount);

    withdraw(eW, 0);
    satisfy (balanceBefore == safeTokenContract.balanceOf(sender));
}
