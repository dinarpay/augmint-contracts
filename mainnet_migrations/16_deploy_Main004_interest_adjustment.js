/* Deploy Main0004_adjustInterest.sol script for Stability Board signature */

const Migrations = artifacts.require("./Migrations.sol");
const Main0004_adjustInterest = artifacts.require("./Main0004_adjustInterest.sol");

/* workaround for
    Error encountered, bailing. Network state unknown. Review successful transactions manually.
    nonce too low
caused by Infura's loadbalancers getting the nonce of account with a delay after a new tx sent */
function waitForInfuraNonce(durationInMs = 20000) {
    console.log(" Waiting ", durationInMs / 1000, " secs for infura loadbalancers to update with new tx nonce");
    return new Promise(resolve => setTimeout(resolve, durationInMs));
}

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(Main0004_adjustInterest);

        await waitForInfuraNonce();

        console.log(" Done with migration step 16. Updating truffle Migrations step manually");
        await Migrations.at("0xE7E9f87805C0BEC5108963D07f85e4cA5892D421").setCompleted(16);
    });
};
