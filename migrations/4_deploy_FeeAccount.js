const FeeAccount = artifacts.require("./FeeAccount.sol");

module.exports = function(deployer) {
    deployer.deploy(
        FeeAccount,
        2000, // transferFeePt in parts per million = 0.2%
        2, // min: 0.02 A-EUR
        500 // max fee: 5 A-EUR);
    );

    deployer.then(async () => {
        const feeAccount = FeeAccount.at(FeeAccount.address);
        await feeAccount.grantPermission(FeeAccount.address, "NoFeeTransferContracts");
    });
};
