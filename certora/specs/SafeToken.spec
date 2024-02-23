methods {
    // SafeToken functions
    function totalSupply() external returns(uint256) envfree;
}

definition SAFE_TOKEN_TOTAL_SUPPLY() returns mathint = 10^27;

invariant totalSupplyIsConstant()
    to_mathint(currentContract.totalSupply()) == SAFE_TOKEN_TOTAL_SUPPLY();
