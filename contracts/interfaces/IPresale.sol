// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

interface IPresale {
    function tokenAddress() external view returns (address);

    function liquidityLockAddress() external view returns (address);

    function uniswapRouterAddress() external view returns (address);

    function rcFarmAddress() external view returns (address);

    function rcEthFarmAddress() external view returns (address);

    function collectedAmount() external view returns (uint256);

    function isPresaleActive() external view returns (bool);

    function isFcfsActive() external view returns (bool);

    function wasPresaleEnded() external view returns (bool);

    function isWhitelisted(address _contributor) external view returns (bool);

    function contribution(address _contributor) external view returns (uint256);

    function addContributors(address[] memory _contributors) external;

    function start(
        address _token,
        address _liquidityLock,
        address _uniswapRouter,
        address _rcFarm,
        address _rcEthFarm,
        address[] memory _contributors
    ) external;

    function activateFcfs() external;

    function end(address payable _team) external;
}
