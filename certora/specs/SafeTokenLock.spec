using SafeToken as safeToken;

// TODO: for every rule and invariant, safeToken address = currentContract.SAFE_TOKEN

methods{
    function getUser(address userAddress) external returns(SafeTokenLockHarness.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLockHarness.UnlockInfo memory) envfree;

    function SafeToken.balanceOf(address) external returns(uint256) envfree;
}

// Used to track total sum of locked tokens
ghost ghostLocked() returns uint256;
// Used to track total sum of unlocked tokens
ghost ghostUnLocked() returns uint256;

rule doesNotAffectOtherUserBalance(method f) {
    env e;  
    address user;
    address otherUser;
    calldataarg args;

    require (otherUser != user);
    require (e.msg.sender == user);

    uint256 otherUserBalanceBefore = totalBalance(e, otherUser);
    f(e,args);
    assert totalBalance(e, otherUser) == otherUserBalanceBefore;
}

ghost mapping(address => mathint) userUnlocks;
ghost mapping(address => mathint) userLocks;

rule cannotWithdrawMoreThanUnlocked(method f) {
    env e;
    uint256 balanceBefore = safeToken.balanceOf(e, e.msg.sender);
    mathint beforeWithdraw = userUnlocks[e.msg.sender];
    withdraw(e);
    require !lastReverted;
    uint256 balanceAfter = safeToken.balanceOf(e, e.msg.sender);
    assert balanceAfter == assert_uint256(balanceBefore + beforeWithdraw);
}

rule cannotWithdrawBeforeCooldown(method f) {
    uint256 i;
    env e;
    uint256 maturesAtTimestamp;
    uint256 amount;
    maturesAtTimestamp, amount = unlockStatus(e, i);
    require maturesAtTimestamp < e.block.timestamp && amount > 0;
    withdraw@withrevert(e);
    assert lastReverted;
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
  havoc ghostLocked assuming ghostLocked@new() == assert_uint256(ghostLocked@old() + (value - old_value));
  userLocks[user] = userLocks[user] + value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
   havoc ghostUnLocked assuming ghostUnLocked@new() == assert_uint256(ghostUnLocked@old() + (value - old_value));
   userUnlocks[key] =  userUnlocks[key] + value;
}

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked() 
    safeToken.balanceOf(currentContract) >= assert_uint256(ghostLocked() + ghostUnLocked());


invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
    userUnlocks[user] <= userLocks[user];

// When total locked increases, contract balance increases
rule contractBalanceIncreasesWhenTotalLockedIncreases(method f) {
    env e;
    calldataarg args;
    uint256 totalLockedBefore = ghostLocked();
    uint256 contractBalanceBefore = safeToken.balanceOf(e, currentContract);
    f(e, args);
    uint256 totalLockedAfter = ghostLocked();
    uint256 contractBalanceAfter = safeToken.balanceOf(e, currentContract);
    assert (totalLockedAfter - totalLockedBefore > 0) => (contractBalanceAfter - contractBalanceBefore > 0);
}

invariant sumOfUserUnlock(address u)
    getUser(u).unlocked == assert_uint96(userUnlocks[u]);

// atleast 1 good case that user can withdraw all tokens using satisfy
rule possibleToFullyWithdraw(address sender, uint256 amount) {
    
    env eL; // env for lock
    env eU; // env for unlock
    env eW; // env for withdraw

    uint256 balanceBefore = safeToken.balanceOf(sender);
    require eL.msg.sender == sender;
    require eU.msg.sender == sender;
    require eW.msg.sender == sender;

    require amount > 0;
    lock(eL, amount);

    uint256 unlockAmount;
    require unlockAmount <= amount;

    unlock(eU, unlockAmount);

    withdraw(eW);
    satisfy (balanceBefore == safeToken.balanceOf(sender));
}

// if unlock index x < unlock index y, then unlock timestamp of x < unlock timestamp of y
rule unlockTimestampOnlyIncreases(uint256 x, uint256 y) {
    require x < y;
    env e;
    uint256 xTimestamp;
    uint256 xAmount;

    xTimestamp, xAmount = unlockStatus(e, x);

    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require xAmount > 0;
    
    uint256 yTimestamp;
    uint256 yAmount;
        
    yTimestamp, yAmount = unlockStatus(e, y);

    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require yAmount > 0;

    assert xTimestamp < yTimestamp;
}

// invariant: if there is an unlock, then start must be less than end
invariant unlockIndexInBetweenStartAndEnd(address u)
    (getUser(u).unlocked > 0) => getUser(u).unlockStart < getUser(u).unlockEnd;

rule unlockTimestampNeverZero() {
    env e;
    uint256 amount;
    uint256 unlockAmount;
    require unlockAmount > 0 && unlockAmount <= amount && amount > 0;
    
    lock(e,amount);
    uint256 id;
    id = unlock(e, unlockAmount);

    assert getUserUnlock(e.msg.sender, id).amount == unlockAmount;
    assert getUserUnlock(e.msg.sender, id).unlockedAt > 0;
}

// TODO cannot withdraw more than twice. If everything is withdrawn, then cannot withdraw again
// TODO withdraw(x+y) equivalent to withdraw(x) and withdraw(y)
// TODO withdraw() greater or equal withdraw(x1)
