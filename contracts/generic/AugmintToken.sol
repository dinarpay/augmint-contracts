/* Generic Augmint Token implementation (ERC20 token)
    This contract manages:
        * Balances of Augmint holders and transactions between them
        * Issues/burns tokens

    TODO:
        - consider generic bytes arg instead of uint for transferAndNotify
        - consider separate transfer fee params and calculation to separate contract (to feeAccount?)
*/
pragma solidity 0.4.19;
import "../interfaces/AugmintTokenInterface.sol";


contract AugmintToken is AugmintTokenInterface {

    address public feeAccount;

    uint public transferFeePt; // in parts per million (ppm) , ie. 2,000 = 0.2%
    uint public transferFeeMin; // with base unit of augmint token, eg. 4 decimals for token, eg. 31000 = 3.1 ACE
    uint public transferFeeMax; // with base unit of augmint token, eg. 4 decimals for token, eg. 31000 = 3.1 ACE

    event TransferFeesChanged(uint transferFeePt, uint transferFeeMin, uint transferFeeMax);

    function AugmintToken(string _name, string _symbol, bytes32 _peggedSymbol, uint8 _decimals, address _feeAccount,
        uint _transferFeePt, uint _transferFeeMin, uint _transferFeeMax) public {

        require(_feeAccount != address(0));
        require(bytes(_name).length > 0);
        name = _name;
        symbol = _symbol;
        peggedSymbol = _peggedSymbol;
        decimals = _decimals;

        feeAccount = _feeAccount;

        transferFeePt = _transferFeePt;
        transferFeeMin = _transferFeeMin;
        transferFeeMax = _transferFeeMax;
    }

    function () public payable { // solhint-disable-line no-empty-blocks
        // to accept ETH sent into reserve (from defaulted loan's collateral )
    }

    // Issue tokens. See MonetarySupervisor but as a rule of thumb issueTo is
    //               only allowed on new loan (by trusted Lender contracts) or strictly to reserve by MonetaryBoard
    function issueTo(address to, uint amount) external restrict("MonetarySupervisorContract") {
        balances[to] = balances[to].add(amount);
        totalSupply = totalSupply.add(amount);
        Transfer(0x0, to, amount);
        AugmintTransfer(0x0, to, amount, "", 0);
    }

    // Burn tokens. Anyone can burn from its own account. YOLO.
    // Used by to burn from Augmint reserve or by Lender contract after loan repayment
    function burn(uint amount) external {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        totalSupply = totalSupply.sub(amount);
        Transfer(msg.sender, 0x0, amount);
        AugmintTransfer(msg.sender, 0x0, amount, "", 0);
    }

    /*  transferAndNotify can be used by contracts which require tokens to have only 1 tx (instead of approve + call)
        Eg. repay loan, lock funds, token sell order on exchange
        Reverts on failue:
            - transfer fails
            - if transferNotification fails (callee must revert on failure)
            - if targetContract is an account or targetContract doesn't have neither transferNotification or fallback fx
        TODO: make data param generic bytes (see receiver code attempt in Locker.transferNotification)
    */
    function transferAndNotify(TokenReceiver target, uint amount, uint data) external {
        _transfer(msg.sender, target, amount, "");

        target.transferNotification(msg.sender, amount, data);
    }

    function transferWithNarrative(address to, uint256 amount, string narrative) external {
        _transfer(msg.sender, to, amount, narrative);
    }

    function transferFromWithNarrative(address from, address to, uint256 amount, string narrative) external {
        _transferFrom(from, to, amount, narrative);
    }

    function setTransferFees(uint _transferFeePt, uint _transferFeeMin, uint _transferFeeMax)
    external restrict("MonetaryBoard") {
        transferFeePt = _transferFeePt;
        transferFeeMin = _transferFeeMin;
        transferFeeMax = _transferFeeMax;
        TransferFeesChanged(transferFeePt, transferFeeMin, transferFeeMax);
    }

    /* helper function for FrontEnd to reduce calls */
    function getParams() external view returns(uint[3]) {
        return [transferFeePt, transferFeeMin, transferFeeMax];
    }

    function balanceOf(address _owner) public view returns (uint256 balance) {
        return balances[_owner];
    }

    function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount, "");
        return true;
    }

    function approve(address _spender, uint256 amount) public returns (bool) {
        require(_spender != 0x0);
        require(msg.sender != _spender); // no need to approve for myself. Makes client code simpler if we don't allow
        allowed[msg.sender][_spender] = amount;
        Approval(msg.sender, _spender, amount);
        return true;
    }

    /**
     ERC20 transferFrom attack protection: https://github.com/DecentLabs/dcm-poc/issues/57
     approve should be called when allowed[_spender] == 0. To increment allowed value is better
     to use this function to avoid 2 calls (and wait until the first transaction is mined)
     Based on MonolithDAO Token.sol */
    function increaseApproval(address _spender, uint _addedValue) public returns (bool) {
        return _increaseApproval(msg.sender, _spender, _addedValue);
    }

    function decreaseApproval(address _spender, uint _subtractedValue) public returns (bool) {
        require(msg.sender != _spender); // no need to approve for myself. Makes client code simpler if we don't allow
        uint oldValue = allowed[msg.sender][_spender];
        if (_subtractedValue > oldValue) {
            allowed[msg.sender][_spender] = 0;
        } else {
            allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
        }
        Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        _transferFrom(from, to, amount, "");
        return true;
    }

    function _increaseApproval(address _approver, address _spender, uint _addedValue) internal returns (bool) {
        require(_approver != _spender); // no need to approve for myself. Makes client code simpler if we don't allow
        allowed[_approver][_spender] = allowed[_approver][_spender].add(_addedValue);
        Approval(_approver, _spender, allowed[_approver][_spender]);
    }

    function calculateFee(address from, address to, uint amount) internal view returns (uint256 fee) {
        if (!permissions[from]["NoFeeTransferContracts"] && !permissions[to]["NoFeeTransferContracts"]) {
            fee = amount.mul(transferFeePt).div(1000000);
            if (fee > transferFeeMax) {
                fee = transferFeeMax;
            } else if (fee < transferFeeMin) {
                fee = transferFeeMin;
            }
        }
        return fee;
    }

    function _transferFrom(address from, address to, uint256 amount, string narrative) private {
        require(balances[from] >= amount);
        require(allowed[from][msg.sender] >= amount);
        require(allowed[from][msg.sender] > 0); // don't allow 0 transferFrom if no approval

        /* NB: fee is deducted from owner. It can result that transferFrom of amount x to fail
                when x + fee is not availale on owner balance */
        _transfer(from, to, amount, narrative);

        allowed[from][msg.sender] = allowed[from][msg.sender].sub(amount);
    }

    function _transfer(address from, address to, uint256 amount, string narrative) private {
        require(to != 0x0);
        require(from != to); // no need to send to myself. Makes client code simpler if we don't allow
        uint fee = calculateFee(from, to, amount);
        if (fee > 0) {
            balances[feeAccount] = balances[feeAccount].add(fee);
            balances[from] = balances[from].sub(amount).sub(fee);
        } else {
            balances[from] = balances[from].sub(amount);
        }
        balances[to] = balances[to].add(amount);
        Transfer(from, to, amount);
        AugmintTransfer(from, to, amount, narrative, fee);
    }

}
