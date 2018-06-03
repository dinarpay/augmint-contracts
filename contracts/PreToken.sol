/* Augmint pretoken contract to record tokens alloceted based on SAFE agreements
These tokens are not fundigble because  agreements can have different conditions (valuationCap and discount).
Despite being nonfundible some ERC20 functions are implemented so agreement owners can see their balances and transfers
    in standard wallets.
Where it's not ERC20 compliant:
  - transfer is only allowed to accounts without an agreement yet or same agreement
  - no approval and transferFrom
 */

pragma solidity 0.4.24;
import "./generic/SafeMath.sol";
import "./generic/Restricted.sol";


contract PreToken is Restricted {
    using SafeMath for uint256;

    uint public constant CHUNK_SIZE = 100;

    string constant public name = "Augmint pretokens"; // solhint-disable-line const-name-snakecase
    string constant public symbol = "APRE"; // solhint-disable-line const-name-snakecase
    uint8 constant public decimals = 0; // solhint-disable-line const-name-snakecase

    uint public totalSupply;

    struct Agreement {
        uint balance;
        bytes32 agreementHash; // SHA-2 (SHA-256) hash of signed agreement.
                              // OSX: shasum -a 256 agreement.pdf
                              // Windows: certUtil -hashfile agreement.pdf SHA256
        uint32 discount; //  discountRate in parts per million , ie. 10,000 = 1%
        uint32 valuationCap; // in USD (no decimals)
    }

    mapping(address => Agreement) public agreements; // Balances for each account
    address[] public allAgreements; // all addresses with agreements to able to iterate over

    event Transfer(address indexed from, address indexed to, uint amount);

    event NewAgreement(address owner, bytes32 agreementHash, uint32 discount, uint32 valuationCap);

    function addAgreement(address owner, bytes32 agreementHash, uint32 discount, uint32 valuationCap)
    external restrict("PreTokenAgreementSignerContract") {
        require(owner != address(0));
        require(agreements[owner].agreementHash == 0x0);
        require(agreementHash != 0x0);

        agreements[owner] = Agreement(0, agreementHash, discount, valuationCap);
        allAgreements.push(owner);

        emit NewAgreement(owner, agreementHash, discount, valuationCap);
    }

    function issueTo(address _to, uint amount) external restrict("PreTokenIssueSignerContract") {
        Agreement storage to = agreements[_to];
        require(to.agreementHash != 0x0);

        to.balance = to.balance.add(amount);
        totalSupply = totalSupply.add(amount);

        emit Transfer(0x0, _to, amount);
    }

    function balanceOf(address who) public view returns (uint) {
        return agreements[who].balance;
    }

    function transfer(address to, uint amount) public returns (bool) { // solhint-disable-line no-simple-event-func-name
        require(
            agreements[to].agreementHash == 0 ||  // allow to transfer to address without agreement
            amount == 0 || // allow 0 amount transfers to any acc for voting
            agreements[to].agreementHash == agreements[msg.sender].agreementHash // allow transfer to acc w/ same agr.
        );

        if (amount > 0) { // transfer agreement if it's not a 0 amount "vote only" transfer
            agreements[msg.sender].balance = agreements[msg.sender].balance.sub(amount);
            agreements[to].balance = agreements[to].balance.add(amount);

            agreements[to].agreementHash = agreements[msg.sender].agreementHash;
            agreements[to].valuationCap = agreements[msg.sender].valuationCap;
            agreements[to].discount = agreements[msg.sender].discount;
        }

        emit Transfer(msg.sender, to, amount);
    }

    function getAgreementsCount() external view returns (uint agreementsCount) {
        return allAgreements.length;
    }

    // UI helper fx - Returns all agreements from offset as
    // [index in allAgreements, account address as uint, balance, agreementHash as uint,
    //          discount as uint, valuationCap as uint ]
    function getAllAgreements(uint offset) external view returns(uint[6][CHUNK_SIZE] agreementsResult) {
        for (uint8 i = 0; i < CHUNK_SIZE && i + offset < allAgreements.length; i++) {
            address agreementAccount = allAgreements[i + offset];
            Agreement storage agreement = agreements[agreementAccount];
            agreementsResult[i] = [ i + offset, uint(agreementAccount), agreement.balance,
                uint(agreement.agreementHash), uint(agreement.discount), uint(agreement.valuationCap)];
        }
    }

}