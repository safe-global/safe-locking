methods {
    // SafeToken functions
    function balanceOf(address account) external returns (uint256) envfree;
    function totalSupply() external returns(uint256) envfree;

    // Prevent SafeToken.transfer to cause HAVOC
    function _.transfer(address, uint256) external => NONDET UNRESOLVED;
}

// Ghost variable to track the total balance based on individual token holder
// balances.
ghost mathint ghostTotalBalance {
    init_state axiom ghostTotalBalance == 0;
}
hook Sstore _balances[KEY address account] uint256 value (uint256 oldValue) STORAGE {
    ghostTotalBalance = ghostTotalBalance + value - oldValue;
}

// Invariant of the Safe contract that its total supply is always constant at
// 1 billion tokens. This invariant is important to ensure that locking contract
// amounts cannot overflow a `uint96`.
invariant totalSupplyIsConstant()
    to_mathint(currentContract.totalSupply()) == 10^27;

// Invariant that proves that the sum of token balances is equal to the total
// supply. This invariant is important to show that transfers in the locking
// contract can never overflow a Safe token holder's balance.
invariant totalSupplyEqualsTotalBalance()
    to_mathint(totalSupply()) == ghostTotalBalance;

// Invariant that proves that the sum of any two user's token balances cannot
// exceed the total supply. This is similar to the above invariant and helps
// document the exact conditions that are required for overflows to be
// impossible when transferring Safe tokens from the locking contract.
invariant userBalancesCannotExceedTotalSupply(address a, address b)
    (a != b && balanceOf(a) + balanceOf(b) <= to_mathint(totalSupply()))
        || (a == b && balanceOf(a) <= totalSupply())
{
    preserved {
        requireInvariant totalSupplyEqualsTotalBalance;
    }
}
