using SafeToken as safeToken;

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
    uint256 balanceBefore = safeToken.balanceOf(e.msg.sender);
    uint256 beforeWithdraw = userUnlocks[e.msg.sender];
    withdraw(e);
    require !lastReverted;
    uint256 balanceAfter = safeToken.balanceOf(e.msg.sender);
    assert balanceAfter == balanceBefore + beforeWithdraw;
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
hook Sstore users[KEY address key] User value (User old_value) STORAGE {
  havoc ghostLocked assuming ghostLocked@new() == ghostLocked@old() + (value.locked - old_value.locked);
  userLocks[key] = userLocks[key] + value.locked;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore users[KEY address key] User value (User old_value) STORAGE {
   havoc ghostUnLocked assuming ghostUnLocked@new() == ghostUnLocked@old() + (value.unlocked - old_value.unlocked);
   userUnLocks[key] =  userUnLocks[key] + value.unlocked;
}

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked() 
    totalSupply() >= ghostLocked() + ghostUnLocked();


invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
    userUnlocks[user] <= userLocks[u];

// When total locked increases, contract balance increases
rule contractBalanceIncreasesWhenTotalLockedIncreases(method f) {
    env e;
    uint256 totalLockedBefore = ghostLocked();
    uint256 contractBalanceBefore = safeToken.balanceOf(currentContract);
    f(e);
    uint256 totalLockedAfter = ghostLocked();
    uint256 contractBalanceAfter = safeToken.balanceOf(currentContract);
    assert (totalLockedAfter - totalLockedBefore > 0) => (contractBalanceAfter - contractBalanceBefore > 0);
}

// cannot withdraw more than twice. If everything is withdrawn, then cannot withdraw again

// atleast 1 good case that user can withdraw all tokens using satisfy

// valid states: 
// unlock(x1) =>  

// invariant x(){
//     unlock(x1);
//     timeStamp t1;
//     unlock(x2);
//     timeStamp t2;
//     t2 > t1;
// }

// withdraw(x+y) equivalent to withdraw(x) and withdraw(y)


invariant sumOfUserUnlock(address u)
    users[u].unlocked == userUnLocks[u];


// invariant: if there is an unlock, then start and end of user struct should not be equal and unlock index should be in between start and end


// withdraw() greater or equal withdraw(x1)
