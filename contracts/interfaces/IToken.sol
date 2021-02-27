// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IToken {
    function pancakeswapPairAddress() external view returns (address);

    function setPancakeswapAddresses(address _pancakeswapPair, address _pancakeswapRouter) external;

    function burnDistributorTokensAndUnlock() external;
}
