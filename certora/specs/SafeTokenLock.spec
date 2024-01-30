using SafeToken as safeToken;

// Used to track total locked tokens
ghost ghostLocked() returns uint256;
// Used to track total unlocked tokens
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
    uint256 balanceBefore = ;
    withdraw(e);
    uint256 balanceAfter = ;
    assert true;

}

rule cannotWithdrawBeforeCooldown(method f) {
    uin256 i;
    env e;
    uint256 maturesAtTimestamp;
    uint256 amount;
    maturesAtTimestamp, amount = unlockStatus(e, i);
    require maturesAtTimestamp < e.block.timestamp && amount > 0;
    withdraw(e);
    assert lastReverted == true;
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore users[KEY address key] User value (User old_value) STORAGE {
  havoc ghostLocked assuming ghostLocked@new() == ghostLocked@old() + (value.locked - old_value.locked);
  userLocks[key] =   userLocks[key] + (value.locked - old_value.locked);
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore users[KEY address key] User value (User old_value) STORAGE {
   havoc ghostUnLocked assuming ghostUnLocked@new() == ghostUnLocked@old() + (value.unlocked - old_value.unlocked);
   userUnLocks[key] =  userUnLocks[key] + (value.unlocked - old_value.unlocked);
}

rule contractBalanceGreaterThanSumOfLockedAndUnlocked(method f) {
  require safeToken.balanceOf(currentContract) >= ghostLocked() + ghostUnLocked();
  calldataarg arg;
  env e;
  f(e, arg);
  assert totalSupply() >= ghostLocked() + ghostUnLocked();
}

invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
    userUnlocks[user] <= userLocks[u];


// cannot withdraw more than twice. If everything is withdrawn, then cannot withdraw again

// When total locked increases, contract balance increases

// atleast 1 good case that user can withdraw all tokens using satisfy

// valid states: 
// unlock(x1) =>  

invariant x(){
    unlock(x1);
    timeStamp t1;
    unlock(x2);
    timeStamp t2;
    t2 > t1;
}

/*

ghost mapping(address => uin256) sumOfUserUnlock;
hooks on unlocks[u][i] () {
    sumOfUserUnlock[u] = sumOfUserUnlock[u] + unlocks[u][i].amount;
}
invariant sumOfUserUnlock
 users[u].unlocked == sumOfUnlockedEntriesPerUesr[u]
*/

// invariant: if there is an unlock, then start and end of user struct should not be equal and unlock index should be in between start and end

// withdraw(x+y) equivalent to withdraw(x) and withdraw(y)

// withdraw() greater or equal withdraw(x1)