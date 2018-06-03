const TokenAEur = artifacts.require("./TokenAEur.sol");
const Exchange = artifacts.require("./Exchange.sol");
const Rates = artifacts.require("./Rates.sol");

module.exports = function(deployer) {
    deployer.deploy(Exchange, TokenAEur.address, Rates.address);
};