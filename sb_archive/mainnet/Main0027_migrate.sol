/* Migrate stuff */

pragma solidity 0.4.24;

import "../../StabilityBoardProxy.sol";
import "../../TokenAEur.sol";
import "../../AugmintReserves.sol";
import "../../InterestEarnedAccount.sol";
import "../../FeeAccount.sol";
import "../../MonetarySupervisor.sol";
import "../../generic/SystemAccount.sol";

contract Main0027_migrate {

    StabilityBoardProxy public constant STABILITY_BOARD_PROXY = StabilityBoardProxy(0xde36a8773531406dCBefFdfd3C7b89fCed7A9F84);

    TokenAEur public constant OLD_TOKEN_AEUR = TokenAEur(0x86A635EccEFFfA70Ff8A6DB29DA9C8DB288E40D0);
    TokenAEur public constant NEW_TOKEN_AEUR = TokenAEur(0xc994a2dEb02543Db1f48688438b9903c4b305ce3);

    SystemAccount public constant OLD_AUGMINT_RESERVES = SystemAccount(0x633cb544b2EF1bd9269B2111fD2B66fC05cd3477);
    AugmintReserves public constant NEW_AUGMINT_RESERVES = AugmintReserves(0x65F30f8DD20c707C1938CcAd7416c7381E6eB9C8);

    InterestEarnedAccount public constant OLD_INTEREST_EARNED_ACCOUNT = InterestEarnedAccount(0x5C1a44E07541203474D92BDD03f803ea74f6947c);
    InterestEarnedAccount public constant NEW_INTEREST_EARNED_ACCOUNT = InterestEarnedAccount(0xf23e0AF0e41341127Bb4e7b203aebCA0185f9EbD);

    FeeAccount public constant OLD_FEE_ACCOUNT = FeeAccount(0xF6B541E1B5e001DCc11827C1A16232759aeA730a);
    FeeAccount public constant NEW_FEE_ACCOUNT = FeeAccount(0xE3ED84A163b9EeaF4f69B4890ae45cC52171Aa7E);

    MonetarySupervisor public constant OLD_MONETARY_SUPERVISOR = MonetarySupervisor(0x1Ca4F9d261707aF8A856020a4909B777da218868);
    MonetarySupervisor public constant NEW_MONETARY_SUPERVISOR = MonetarySupervisor(0x27484AFe9e6c332fB07F21Fac82d442EBe1D22c3);

    function execute(Main0027_migrate /* self, not used */) external {
        // called via StabilityBoardProxy
        require(address(this) == address(STABILITY_BOARD_PROXY), "only execute via StabilityBoardProxy");

        // ===========================
        // migrate ETH to new reserve
        // ===========================

        // function withdraw(AugmintToken tokenAddress, address to, uint tokenAmount, uint weiAmount, string narrative)
        OLD_AUGMINT_RESERVES.withdraw(NEW_TOKEN_AEUR, address(NEW_AUGMINT_RESERVES), 0, address(OLD_AUGMINT_RESERVES).balance, "migration");

        // ==================================================
        // convert old tokens in new interestearnedaccount
        // ==================================================

        OLD_FEE_ACCOUNT.grantPermission(NEW_INTEREST_EARNED_ACCOUNT, "NoTransferFee");

        uint amount = OLD_TOKEN_AEUR.balanceOf(NEW_INTEREST_EARNED_ACCOUNT);

        // function withdraw(AugmintToken tokenAddress, address to, uint tokenAmount, uint weiAmount, string narrative)
        NEW_INTEREST_EARNED_ACCOUNT.withdraw(OLD_TOKEN_AEUR, STABILITY_BOARD_PROXY, amount, 0, "migrate");

        //function transferAndNotify(TokenReceiver target, uint amount, uint data) external {
        OLD_TOKEN_AEUR.transferAndNotify(NEW_MONETARY_SUPERVISOR, amount, 0);

        // function transfer(address to, uint256 amount) external returns (bool) {
        NEW_TOKEN_AEUR.transfer(NEW_INTEREST_EARNED_ACCOUNT, amount);

        OLD_FEE_ACCOUNT.revokePermission(NEW_INTEREST_EARNED_ACCOUNT, "NoTransferFee");
    }
}