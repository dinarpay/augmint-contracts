/* Augmint Crypto Euro token (ACE) implementation */
pragma solidity 0.4.24;
import "./interfaces/TransferFeeInterface.sol";
import "./generic/AugmintToken.sol";


contract TokenAEur is AugmintToken {
    constructor(address _permissionGranterContract, TransferFeeInterface _feeAccount)
    public AugmintToken(_permissionGranterContract, "Augmint Crypto Euro", "AEUR", "EUR", 2, _feeAccount)
    {} // solhint-disable-line no-empty-blocks

}
