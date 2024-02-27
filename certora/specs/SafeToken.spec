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
// contract can never overflow a Safe token holder's balance. In particular this
// also implies that:
//
// ```
// forall address a. balanceOf(a) <= totalSupply()
// forall address a. forall address b. a != b
//    => balanceOf(a) + balanceOf(b) <= totalSupply()
// ```
//
// Unfortunately, proving this with the Certora tool is not really possible in
// the absence of a "sum of" keyword (that may be added in the future), as
// proving it for two addresses requires proving it for three addresses, which
// requires proving it for 4 addresses, etc.
invariant totalSupplyEqualsTotalBalance()
    to_mathint(totalSupply()) == ghostTotalBalance;
