const TokenAEur = artifacts.require("./TokenAEur.sol");
const MonetarySupervisor = artifacts.require("./MonetarySupervisor.sol");
const Rates = artifacts.require("./Rates.sol");
const SafeMath = artifacts.require("./SafeMath.sol");
const LoanManager = artifacts.require("./LoanManager.sol");
const FeeAccount = artifacts.require("./FeeAccount.sol");

module.exports = function(deployer) {
    deployer.link(SafeMath, LoanManager);
    deployer.deploy(LoanManager, TokenAEur.address, MonetarySupervisor.address, Rates.address);
    deployer.then(async () => {
        const lm = LoanManager.at(LoanManager.address);
        const feeAccount = FeeAccount.at(FeeAccount.address);
        const monetarySupervisor = MonetarySupervisor.at(MonetarySupervisor.address);

        await Promise.all([
            feeAccount.grantPermission(LoanManager.address, "NoFeeTransferContracts"),
            monetarySupervisor.grantPermission(LoanManager.address, "LoanManagerContracts")
        ]);

        const onTest =
            web3.version.network == 999 ||
            web3.version.network == 4 ||
            web3.version.network == 3 ||
            web3.version.network == 1976 ||
            web3.version.network == 4447
                ? true
                : false;
        if (!onTest) {
            console.log(
                "   Not on a known test network. NOT adding test loanProducts. Network id: ",
                web3.version.network
            );
            return;
        }
        console.log("   On a test network. Adding test loanProducts. Network id: ", web3.version.network);
        // term (in sec), discountRate, loanCoverageRatio, minDisbursedAmount (w/ 4 decimals), defaultingFeePt, isActive
        await lm.addLoanProduct(31536000, 800000, 800000, 3000, 50000, true); // due in 365d
        await lm.addLoanProduct(15552000, 850000, 800000, 3000, 50000, true); // due in 180d
        await lm.addLoanProduct(7776000, 910000, 800000, 3000, 50000, true); // due in 90d
        await lm.addLoanProduct(2592000, 950000, 800000, 3000, 50000, true); // due in 30d
        await lm.addLoanProduct(86400, 970000, 850000, 3000, 50000, true); // due in 1 day
        await lm.addLoanProduct(3600, 985000, 900000, 2000, 50000, true); // due in 1hr for testing repayments
        await lm.addLoanProduct(1, 990000, 950000, 1000, 50000, true); // defaults in 1 secs for testing
    });
};
