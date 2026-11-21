// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayrollGuard} from "../../contracts/PayrollGuard.sol";

contract MockERC20 {
    string public name;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals;

    constructor(string memory name_, uint8 decimals_) {
        name = name_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PayrollGuardTest is Test {
    PayrollGuard guard;
    MockERC20 usdt;
    MockERC20 wbrl;
    address owner = makeAddr("owner");
    uint256 agentKey = 0xA11CE;
    address agent = vm.addr(agentKey);
    address maria = makeAddr("maria");
    address reactor = makeAddr("reactor");

    function setUp() public {
        usdt = new MockERC20("USDT", 6);
        wbrl = new MockERC20("wBRL", 18);
        guard = new PayrollGuard(owner, agent, address(usdt), 5_000_000, uint64(block.timestamp + 7 days));
        vm.startPrank(owner);
        guard.setTarget(address(usdt), true);
        guard.setTarget(address(wbrl), true);
        guard.setTarget(reactor, true);
        guard.setPayee(maria, true);
        vm.stopPrank();
        usdt.mint(address(guard), 10_000_000);
        wbrl.mint(address(guard), 100 ether);
    }

    function testAgentPaysAllowlistedPayee() public {
        vm.prank(agent);
        guard.execute(address(wbrl), abi.encodeWithSelector(wbrl.transfer.selector, maria, 1 ether));
        assertEq(wbrl.balanceOf(maria), 1 ether);
    }

    function testStrangerCannotExecute() public {
        vm.expectRevert(PayrollGuard.NotAgent.selector);
        guard.execute(address(wbrl), abi.encodeWithSelector(wbrl.transfer.selector, maria, 1 ether));
    }

    function testUnknownPayeeReverts() public {
        address stranger = makeAddr("stranger");
        vm.prank(agent);
        vm.expectRevert(PayrollGuard.PayeeNotAllowed.selector);
        guard.execute(address(wbrl), abi.encodeWithSelector(wbrl.transfer.selector, stranger, 1 ether));
    }

    function testQuoteApproveIsMetered() public {
        vm.prank(agent);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, reactor, 1_000_000));
        assertEq(usdt.allowance(address(guard), reactor), 1_000_000);
        (, , , uint256 spent,) = guard.status();
        assertEq(spent, 1_000_000);
    }

    function testCapStopsASecondApprove() public {
        vm.startPrank(agent);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, reactor, 4_000_000));
        vm.expectRevert(PayrollGuard.CapExceeded.selector);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, reactor, 2_000_000));
        vm.stopPrank();
    }

    function testApproveSpenderMustBeAllowlisted() public {
        address dex = makeAddr("dex");
        vm.prank(agent);
        vm.expectRevert(PayrollGuard.TargetNotAllowed.selector);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, dex, 1));
    }

    function testRevokeHaltsTheAgent() public {
        vm.prank(owner);
        guard.revoke();
        vm.prank(agent);
        vm.expectRevert(PayrollGuard.RevokedOrExpired.selector);
        guard.execute(address(wbrl), abi.encodeWithSelector(wbrl.transfer.selector, maria, 1 ether));
        (bool isRevoked,,,,) = guard.status();
        assertTrue(isRevoked);
    }

    function testExpiryHaltsTheAgent() public {
        vm.warp(block.timestamp + 8 days);
        vm.prank(agent);
        vm.expectRevert(PayrollGuard.RevokedOrExpired.selector);
        guard.execute(address(wbrl), abi.encodeWithSelector(wbrl.transfer.selector, maria, 1 ether));
    }

    function testOwnerCanRescueAfterRevoke() public {
        vm.prank(owner);
        guard.revoke();
        vm.prank(owner);
        guard.rescue(address(usdt), owner, 10_000_000);
        assertEq(usdt.balanceOf(owner), 10_000_000);
    }

    function testTrailingBytesDoNotBreakExecute() public {
        bytes memory callData = abi.encodeWithSelector(wbrl.transfer.selector, maria, 1 ether);
        // ERC-8021 lives on the outer transaction, not inside `data`. Extra
        // trailing bytes on the inner call must still decode.
        bytes memory tagged = bytes.concat(callData, hex"63656c6f5f746573740c00802180218021802180218021802180218021");
        vm.prank(agent);
        guard.execute(address(wbrl), tagged);
        assertEq(wbrl.balanceOf(maria), 1 ether);
    }

    function testErc1271AcceptsTheAgentAndRejectsAWrappedSignature() public {
        bytes32 hash = keccak256("textile-taker-control");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, hash);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(guard.isValidSignature(hash, sig), bytes4(0x1626ba7e));

        bytes memory wrapped = bytes.concat(sig, bytes32(uint256(1)), hash);
        assertEq(guard.isValidSignature(hash, wrapped), bytes4(0xffffffff));

        vm.prank(owner);
        guard.revoke();
        assertEq(guard.isValidSignature(hash, sig), bytes4(0xffffffff));
    }

    function testDailyWindowResets() public {
        vm.prank(agent);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, reactor, 5_000_000));
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        guard.execute(address(usdt), abi.encodeWithSelector(usdt.approve.selector, reactor, 1_000_000));
        (, , , uint256 spent,) = guard.status();
        assertEq(spent, 1_000_000);
    }
}
