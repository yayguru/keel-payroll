// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayrollGuard} from "../../contracts/PayrollGuard.sol";

interface IERC20Lite {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

/// @notice Runs against a Celo mainnet fork. Proves the real USD₮ contract
///         accepts a transfer from the guard after `deal`, and that the
///         Textile reactor is deployed at the documented address.
contract PayrollGuardForkTest is Test {
    address constant USDT = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e;
    address constant REACTOR = 0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("celo"));
    }

    function testForkReactorAndUsdtAreLive() public {
        assertGt(REACTOR.code.length, 0, "reactor missing");
        assertGt(USDT.code.length, 0, "usdt missing");
        emit log_string(IERC20Lite(USDT).symbol());
        assertEq(IERC20Lite(USDT).decimals(), 6);
    }

    function testForkTaggedPayoutOfRealUsdt() public {
        address owner = makeAddr("owner");
        uint256 agentKey = 0xA11CE;
        address agent = vm.addr(agentKey);
        address maria = makeAddr("maria");

        PayrollGuard guard = new PayrollGuard(owner, agent, USDT, 5_000_000, uint64(block.timestamp + 1 days));
        vm.startPrank(owner);
        guard.setTarget(USDT, true);
        guard.setPayee(maria, true);
        vm.stopPrank();

        deal(USDT, address(guard), 2_000_000);
        assertEq(IERC20Lite(USDT).balanceOf(address(guard)), 2_000_000, "deal did not fund real USDT");

        vm.prank(agent);
        guard.execute(USDT, abi.encodeWithSelector(IERC20Lite.transfer.selector, maria, 100_000));
        assertEq(IERC20Lite(USDT).balanceOf(maria), 100_000);

        vm.prank(owner);
        guard.revoke();
        vm.prank(agent);
        vm.expectRevert(PayrollGuard.RevokedOrExpired.selector);
        guard.execute(USDT, abi.encodeWithSelector(IERC20Lite.transfer.selector, maria, 1));
    }
}
