// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;
import "./BaseTOFT.sol";

/// @title mtOFT contract
/// @notice mtOFT wrapper contract
/// @dev transforms a normal ERC20 or the native gas token into an OFTV2 type contract
///      - wrapping & unwrapping of the ERC20/the gas token can happen on multiple chains defined by the `connectedChains` mapping
contract mTapiocaOFT is BaseTOFT {
    using SafeERC20 for IERC20;

    // ************ //
    // *** VARS *** //
    // ************ //

    /// @notice allowed chains where you can unwrap your TOFT
    mapping(uint256 => bool) public connectedChains;

    /// @notice map of approved balancers
    /// @dev a balancer can extract the underlying
    mapping(address => bool) public balancers;

    // ************** //
    // *** EVENTS *** //
    // ************** //
    /// @notice event emitted when a connected chain is reigstered or unregistered
    event ConnectedChainStatusUpdated(uint256 _chain, bool _old, bool _new);
    /// @notice event emitted when balancer status is updated
    event BalancerStatusUpdated(
        address indexed _balancer,
        bool _bool,
        bool _new
    );
    /// @notice event emitted when rebalancing is performed
    event Rebalancing(
        address indexed _balancer,
        uint256 _amount,
        bool _isNative
    );

    /// @notice creates a new mTapiocaOFT
    /// @param _lzEndpoint LayerZero endpoint address
    /// @param _erc20 true the underlying ERC20 address
    /// @param _yieldBox the YieldBox address
    /// @param _name the TOFT name
    /// @param _symbol the TOFT symbol
    /// @param _decimal the TOFT decimal
    /// @param _hostChainID the TOFT host chain LayerZero id
    constructor(
        address _lzEndpoint,
        address _erc20,
        IYieldBoxBase _yieldBox,
        string memory _name,
        string memory _symbol,
        uint8 _decimal,
        uint256 _hostChainID,
        address payable _leverageModule,
        address payable _strategyModule,
        address payable _marketModule,
        address payable _optionsModule
    )
        BaseTOFT(
            _lzEndpoint,
            _erc20,
            _yieldBox,
            _name,
            _symbol,
            _decimal,
            _hostChainID,
            _leverageModule,
            _strategyModule,
            _marketModule,
            _optionsModule
        )
    {
        if (block.chainid == _hostChainID) {
            connectedChains[_hostChainID] = true;
        }
    }

    // ************************ //
    // *** PUBLIC FUNCTIONS *** //
    // ************************ //
    /// @notice Wrap an ERC20 with a 1:1 ratio with a fee if existing.
    /// @dev Since it can be executed only on the main chain, if an address exists on the OP chain it will not allowed to wrap.
    /// @param _toAddress The address to wrap the ERC20 to.
    /// @param _amount The amount of ERC20 to wrap.
    function wrap(
        address _fromAddress,
        address _toAddress,
        uint256 _amount
    ) external payable onlyHostChain {
        require(!balancers[msg.sender], "TOFT_auth");
        if (erc20 == address(0)) {
            _wrapNative(_toAddress);
        } else {
            _wrap(_fromAddress, _toAddress, _amount);
        }
    }

    /// @notice Unwrap an ERC20/Native with a 1:1 ratio. Called only on host chain.
    /// @param _toAddress The address to unwrap the tokens to.
    /// @param _amount The amount of tokens to unwrap.
    function unwrap(address _toAddress, uint256 _amount) external {
        require(connectedChains[block.chainid], "TOFT_host");
        require(!balancers[msg.sender], "TOFT_auth");
        _unwrap(_toAddress, _amount);
    }

    // *********************** //
    // *** OWNER FUNCTIONS *** //
    // *********************** //
    /// @notice updates a connected chain whitelist status
    /// @param _chain the block.chainid of that specific chain
    /// @param _status the new whitelist status
    function updateConnectedChain(
        uint256 _chain,
        bool _status
    ) external onlyOwner {
        emit ConnectedChainStatusUpdated(
            _chain,
            connectedChains[_chain],
            _status
        );
        connectedChains[_chain] = _status;
    }

    /// @notice updates a Balancer whitelist status
    /// @param _balancer the operator address
    /// @param _status the new whitelist status
    function updateBalancerState(
        address _balancer,
        bool _status
    ) external onlyOwner {
        emit BalancerStatusUpdated(_balancer, balancers[_balancer], _status);
        balancers[_balancer] = _status;
    }

    /// @notice extracts the underlying token/native for rebalancing
    /// @param _amount the amount used for rebalancing
    function extractUnderlying(uint256 _amount) external {
        require(balancers[msg.sender], "TOFT_auth");

        bool _isNative = erc20 == address(0);
        if (_isNative) {
            _safeTransferETH(msg.sender, _amount);
        } else {
            IERC20(erc20).safeTransfer(msg.sender, _amount);
        }

        emit Rebalancing(msg.sender, _amount, _isNative);
    }
}
