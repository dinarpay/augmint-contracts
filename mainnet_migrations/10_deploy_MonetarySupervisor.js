const MonetarySupervisor = artifacts.require("./MonetarySupervisor.sol");
const TokenAEur = artifacts.require("./TokenAEur.sol");
const InterestEarnedAccount = artifacts.require("./InterestEarnedAccount.sol");
const AugmintReserves = artifacts.require("./AugmintReserves.sol");

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        await deployer.deploy(
            MonetarySupervisor,
            accounts[0],
            TokenAEur.address,
            AugmintReserves.address,
            InterestEarnedAccount.address,

            /* Parameters Used to ensure totalLoanAmount or totalLockedAmount difference is withing limit and system also works
            when any of those 0 or low. */
            200000 /* ltdLockDifferenceLimit = 20%  allow lock if Loan To Deposit ratio stays within 1 - this param
                                                stored as parts per million */,
            200000 /* ltdLoanDifferenceLimit = 20%  allow loan if Loan To Deposit ratio stays within 1 + this param
                                                                                        stored as parts per million */,
            50000 /* allowedLtdDifferenceAmount = 500 A-EUR  if totalLoan and totalLock difference is less than that
                                        then allow loan or lock even if ltdDifference limit would go off with it */
        );
    });
};
