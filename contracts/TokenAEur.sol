/* Augmint Crypto Euro token (ACE) implementation */
pragma solidity ^0.4.23;
import "./interfaces/TransferFeeInterface.sol";
import "./generic/AugmintToken.sol";


contract TokenAEur is AugmintToken {
    constructor(address _stabilityBoardSigner, TransferFeeInterface _feeAccount)
    public AugmintToken("Augmint Crypto Euro", "AEUR", "EUR", 2, _stabilityBoardSigner, _feeAccount)
    {} // solhint-disable-line no-empty-blocks

}
