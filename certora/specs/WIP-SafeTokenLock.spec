import "../helpers/erc20.spec";

using SafeToken as safeToken;

methods {

    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;
    function getStartAndEnd(address userAddress) external returns(uint32, uint32) envfree;
    function safeToken.balanceOf(address) external returns(uint256) envfree;

}

definition onlyStateChangingAction(method f) returns bool =
    f.selector == sig:lock(uint96).selector
    || f.selector == sig:unlock(uint96).selector
    || f.selector == sig:withdraw(uint32).selector;

ghost mapping(address => mathint) userUnlocks {
    init_state axiom forall address X.userUnlocks[X] == 0;
}

ghost mapping(address => mathint) userLocks {
    init_state axiom forall address X.userLocks[X] == 0;
}

hook Sload uint96 v currentContract.users[KEY address user].locked STORAGE {
    require userLocks[user] == to_mathint(v);
}

hook Sload uint96 v currentContract.users[KEY address user].unlocked STORAGE { 
    require userUnlocks[user] == to_mathint(v);
}

// function safeAssumptions(address a, env e) {
//     require e.msg.sender != currentContract;
//     requireInvariant noAllowance(a, e);
// }

// invariant noAllowance(address a, env e1)
//     safeToken.allowance(e, a, e1.msg.sender) == 0
// { preserved with (env e) { safeAssumptions(a, e); } }

// Used to track total sum of locked tokens
ghost mathint ghostLocked {
    init_state axiom ghostLocked == 0;
}
ghost mathint ghostUnlocked {
    init_state axiom ghostUnlocked == 0;
}

// rule contractBalanceCannotDecreaseBeforeCooldown(method f) {
//     uint32 i;
//     env e;
//     setup(e);
//     calldataarg args;
//     uint256 maturesAtTimestamp;
//     uint96 amount;

//     uint256 balanceBefore = safeToken.balanceOf(currentContract);
//     maturesAtTimestamp = unlockInfo.unlockedAt;
//     f(e, args);
//     uint256 balanceAfter = safeToken.balanceOf(currentContract);
//     assert balanceAfter == balanceBefore;
// }

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
    ghostLocked = ghostLocked + (value - old_value);
    userLocks[user] = value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
    ghostUnlocked = ghostUnlocked + (value - old_value);
    userUnlocks[key] = value;
}

// hook Sload uint96 value SafeTokenLockHarness.users[KEY address user].locked STORAGE {

// }

// invariant: ghostLocked greater than individual lock 
// if user.locked > 0 then f(...) user.locked >= before or user.unlocked
// if user.locked After + (sum of all user.unlocked with ts >(now + 30 days ) ) >= user.locked before
// sum can decrease only after 30 days are over -> assume ghost variable sum . separate spec: fix in spec file start time, increasing sum. f(...) > startTime
// balance is greater than all locked and unlocked tokens

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked(address a) 
    to_mathint(safeToken.balanceOf(currentContract)) >= ghostLocked + ghostUnlocked;
    // {
    //     preserved with (env e){
    //        requireInvariant safeToken.allowance(a, e.msg.sender) = 0;
    //     }
    // }


// rule unlockedTokensAlwaysLessOrEqualLocked{
//    // userUnlocks[user] + userLocks[user] sum should not change on unlock or (except withdraw or lock)
// }
// invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
//     userUnlocks[user] <= userLocks[user];

// When total locked increases, contract balance increases
rule contractBalanceIncreasesWhenTotalLockedIncreases(method f) filtered {
    f -> onlyStateChangingAction(f)
} {
    env e;
    calldataarg args;
    mathint totalLockedBefore = ghostLocked;
    uint256 contractBalanceBefore = safeToken.balanceOf(e, currentContract);
    f(e, args);
    mathint totalLockedAfter = ghostLocked;
    uint256 contractBalanceAfter = safeToken.balanceOf(e, currentContract);
    assert (totalLockedAfter - totalLockedBefore > 0) => (contractBalanceAfter - contractBalanceBefore > 0);
}

invariant sumOfUserUnlock(address u)
    to_mathint(getUser(u).unlocked) == userUnlocks[u];

// if unlock index x < unlock index y, then unlock timestamp of x < unlock timestamp of y
rule unlockTimestampOnlyIncreases(uint32 x, uint32 y) {
    require x < y;
    env e;
    uint256 xTimestamp;
    uint96 xAmount;

    SafeTokenLock.UnlockInfo unlockInfo1 =  getUserUnlock(e.msg.sender, x);
    xTimestamp = unlockInfo1.unlockedAt;
    xAmount = unlockInfo1.amount;
    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require xAmount > 0;
    
    uint256 yTimestamp;
    uint96 yAmount;
        
    SafeTokenLock.UnlockInfo unlockInfo2 = getUserUnlock(e.msg.sender, y);
    yTimestamp = unlockInfo2.unlockedAt; 
    yAmount = unlockInfo2.amount;

    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require yAmount > 0;

    assert xTimestamp < yTimestamp;
}

// invariant: if there is an unlock, then start must be less than end
invariant unlockStartLessThanUnlockEnd(address u)
    (getUser(u).unlocked > 0) => getUser(u).unlockStart < getUser(u).unlockEnd;

rule unlockTimestampNeverZero() {
    env e;
    uint96 amount;
    uint96 unlockAmount;
    require unlockAmount > 0 && unlockAmount <= amount && amount > 0;
    
    lock(e,amount);
    uint32 id;
    id = unlock(e, unlockAmount);

    assert getUserUnlock(e.msg.sender, id).amount == unlockAmount;
    assert getUserUnlock(e.msg.sender, id).unlockedAt > 0;
}

// TODO If everything is withdrawn, then cannot withdraw again
// TODO withdraw(x+y) equivalent to withdraw(x) and withdraw(y)
// TODO withdraw() greater or equal withdraw(x1)
