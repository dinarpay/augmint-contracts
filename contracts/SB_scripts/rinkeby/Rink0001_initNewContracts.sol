/* script to setup contracts after full redeploy on Rinkeby.
    called via  StabilityBoardProxy (MultiSig) but deployer account is the only signer yet because
        these working on the new contracts only.
        Stability Board and pretoken signers will be added and deployer will be removed when setup is successful.
*/

pragma solidity 0.4.24;

import "../../generic/MultiSig.sol";
import "../../PreToken.sol";
import  "../../Rates.sol";
import "../../FeeAccount.sol";
import "../../AugmintReserves.sol";
import "../../InterestEarnedAccount.sol";
import "../../TokenAEur.sol";
import "../../MonetarySupervisor.sol";
import "../../LoanManager.sol";
import "../../Locker.sol";
import "../../Exchange.sol";


contract Rink0001_initNewContracts {
    address constant RATES_FEEDER_ACCOUNT = 0x8C58187a978979947b88824DCdA5Cb5fD4410387;

    // new contracts
    address constant preTokenProxyAddress = 0x0775465245e523b45Cc3b41477d44F908e22feDE;
    address constant stabilityBoardProxyAddress = 0x44022C28766652EC5901790E53CEd7A79a19c10A;

    PreToken constant preToken = PreToken(0xFc69b4F2A7de7c68c46A8230eCDF0cff49Eb8f1F);
    Rates constant rates = Rates(0xf25638C7d37fCa0cBc124b3925eCe156a20e1f03);
    FeeAccount constant feeAccount = FeeAccount(0x0F5983a6d760BF6E385339af0e67e87420d413EC);
    AugmintReserves constant augmintReserves = AugmintReserves(0x6386F25d2029ea3164838BF6494Ed85C01fC1B03);
    InterestEarnedAccount constant interestEarnedAccount = InterestEarnedAccount(0xdf8c338A89f827A6D62804905ed415B6a382f92E);
    TokenAEur constant tokenAEur = TokenAEur(0xe54f61d6EaDF03b658b3354BbD80cF563fEca34c);
    MonetarySupervisor constant monetarySupervisor = MonetarySupervisor(0x01844c9bade08A8ffdB09aD9f1fecE2C83a6E6a8);
    LoanManager constant loanManager = LoanManager(0x3b5DD323534659655EEccc642c3e338AAbD0B219);
    Locker constant locker = Locker(0x5B94AaF241E8039ed6d3608760AE9fA7186767d7);
    Exchange constant exchange = Exchange(0x5e2Be81aB4237c7c08d929c42b9F13cF4f9040D2);

    // Legacy contracts
    /* Dropped support for very old tokens:
        TokenAEur constant oldToken1 = TokenAEur(0x95AA79D7410Eb60f49bfD570b445836d402Bd7b1);
        TokenAEur constant oldToken2 = TokenAEur(0xA35D9de06895a3A2E7eCaE26654b88Fe71C179eA); */
    TokenAEur constant oldToken3 = TokenAEur(0x135893F1A6B3037BB45182841f18F69327366992);
    TokenAEur constant oldToken4 = TokenAEur(0x6C90c10D7A33815C2BaeeD66eE8b848F1D95268e);

    Locker constant oldLocker1 = Locker(0xf98AE1fb568B267A7632BF54579A153C892E2ec2);
    Locker constant oldLocker2 = Locker(0xd0B6136C2E35c288A903E836feB9535954E4A9e9);

    LoanManager constant oldLoanManager1 = LoanManager(0xBdb02f82d7Ad574f9F549895caf41E23a8981b07);
    LoanManager constant oldLoanManager2 = LoanManager(0x214919Abe3f2b7CA7a43a799C4FC7132bBf78e8A);


    function execute(Rink0001_initNewContracts /* self, not used */) external {
        // called via StabilityBoardProxy
        require(address(this) == stabilityBoardProxyAddress, "only deploy via stabilityboardsigner");

        /******************************************************************************
         * Set up permissions
         ******************************************************************************/
        //  preToken Permissions
        bytes32[] memory preTokenPermissions = new bytes32[](2); // dynamic array needed for grantMultiplePermissions()
        preTokenPermissions[0] = "PreTokenSigner";
        preTokenPermissions[1] = "PermissionGranter";
        preToken.grantMultiplePermissions(preTokenProxyAddress, preTokenPermissions);
        // deploy script temporarly granted PermissionGranter to this script in order to run this script
        //   now we can remove it as we add grant it to preTokenProxy
        preToken.revokePermission(stabilityBoardProxyAddress, "PermissionGranter");

        // StabilityBoard
        rates.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        feeAccount.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        interestEarnedAccount.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        tokenAEur.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        augmintReserves.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        monetarySupervisor.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        loanManager.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        locker.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");
        exchange.grantPermission(stabilityBoardProxyAddress, "StabilityBoard");

        // RatesFeeder permissions to allow calling setRate()
        rates.grantPermission(RATES_FEEDER_ACCOUNT, "RatesFeeder");

        // set NoTransferFee permissions
        feeAccount.grantPermission(feeAccount, "NoTransferFee");
        feeAccount.grantPermission(augmintReserves, "NoTransferFee");
        feeAccount.grantPermission(interestEarnedAccount, "NoTransferFee");
        feeAccount.grantPermission(monetarySupervisor, "NoTransferFee");
        feeAccount.grantPermission(loanManager, "NoTransferFee");
        feeAccount.grantPermission(locker, "NoTransferFee");
        feeAccount.grantPermission(exchange, "NoTransferFee");

        // set MonetarySupervisor permissions
        interestEarnedAccount.grantPermission(monetarySupervisor, "MonetarySupervisor");
        tokenAEur.grantPermission(monetarySupervisor, "MonetarySupervisor");
        augmintReserves.grantPermission(monetarySupervisor, "MonetarySupervisor");

        // set LoanManager permissions
        monetarySupervisor.grantPermission(loanManager, "LoanManager");

        // set Locker permissions
        monetarySupervisor.grantPermission(locker, "Locker");

        /******************************************************************************
         * Setup permissions for legacy contracts
         ******************************************************************************/

        monetarySupervisor.grantPermission(oldLocker1, "Locker");
        monetarySupervisor.grantPermission(oldLocker2, "Locker");

        monetarySupervisor.grantPermission(oldLoanManager1, "LoanManager");
        monetarySupervisor.grantPermission(oldLoanManager2, "LoanManager");

        monetarySupervisor.setAcceptedLegacyAugmintToken(oldToken3, true);
        monetarySupervisor.setAcceptedLegacyAugmintToken(oldToken4, true);

        /* NB: to allow token conversion w/o fee (oldToken.transferAndNotify transfers to MonetarySupervisor)
            new MonetarySupervisor requires NoTransferFee permission on old feeAccount.
            It's not in this script b/c old feeAccount wasn't multisig (it's granted by deployer acc)
            This permission will need to be granted via Multisg in future token redeploys */

        /******************************************************************************
         * Add loan products
         ******************************************************************************/
        // term (in sec), discountRate, loanCoverageRatio, minDisbursedAmount (w/ 4 decimals), defaultingFeePt, isActive
        loanManager.addLoanProduct(30 days, 990641, 600000, 1000, 50000, true); //  12% p.a.
        loanManager.addLoanProduct(14 days, 996337, 600000, 1000, 50000, true); // 10% p.a.
        loanManager.addLoanProduct(7 days, 998170, 600000, 1000, 50000, true); // 10% p.a.

        loanManager.addLoanProduct(1 hours, 999989, 980000, 2000, 50000, true); // due in 1hr for testing repayments ? p.a.
        loanManager.addLoanProduct(1 seconds, 999999, 990000, 3000, 50000, true); // defaults in 1 secs for testing ? p.a.

        /******************************************************************************
         * Add lock products
         ******************************************************************************/
        // (perTermInterest, durationInSecs, minimumLockAmount, isActive)
        locker.addLockProduct(4019, 30 days, 1000, true);  // 5% p.a.
        locker.addLockProduct(1506, 14 days, 1000, true);  // 4% p.a.
        locker.addLockProduct(568, 7 days, 1000, true);    //  3% p.a.

        locker.addLockProduct(3, 1 hours, 2000, true); // for testing, ~2.66% p.a.
        locker.addLockProduct(1 , 1 minutes, 3000, true); // for testing, ~69.15% p.a.
    }

}
