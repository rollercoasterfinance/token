const Presale = artifacts.require('Presale');
const PancakeswapRouterMock = artifacts.require('PancakeswapRouterMock');
const TokenMock = artifacts.require('TokenMock');
const BuybackInitializerMock = artifacts.require('BuybackInitializerMock');
const FarmActivatorMock = artifacts.require('FarmActivatorMock');
const { expect } = require('chai');
const { send, balance, expectRevert, expectEvent, ether } = require('@openzeppelin/test-helpers');

contract('Presale', (accounts) => {
    const [alice, bob, curtis, dick, earl, frank, greg] = accounts;
    const liquidityLockAddress = frank;
    const pancakeswapPairAddress = greg;
    const maxSupply = '327500000';
    let presale;
    let token;
    let buyback;
    let pancakeswapRouter;
    let rcFarm;
    let rcEthFarm;

    const sendEther = (from, value) => presale.send(value, { from, gas: 150000, gasPrice: 0 });

    const presaleStart = async (privateContributors, contributors, from, setSoftcap = true) => {
        if (setSoftcap) {
            await presale.setSoftcap(ether('1'));
        }

        return presale.start(
            ether('6'),
            ether('3'),
            ether('3'),
            token.address,
            pancakeswapPairAddress,
            buyback.address,
            liquidityLockAddress,
            pancakeswapRouter.address,
            rcFarm.address,
            rcEthFarm.address,
            privateContributors,
            contributors,
            { from }
        );
    };

    const presaleActivatePresale = () => presale.activatePresale();

    const presaleActivateFcfs = (from) => presale.activateFcfs({ from });

    const presaleEnd = (from, to) => presale.end(to, { from });

    const presaleAddContributors = (contributors, from) => presale.addContributors(contributors, { from });

    beforeEach(async () => {
        presale = await Presale.new();
        token = await TokenMock.new(presale.address, ether(maxSupply));
        pancakeswapRouter = await PancakeswapRouterMock.new();
        buyback = await BuybackInitializerMock.new();
        rcFarm = await FarmActivatorMock.new();
        rcEthFarm = await FarmActivatorMock.new();
    });

    context('non owners', () => {
        it('should not allow start from non owner', async () => {
            await expectRevert(presaleStart([], [], bob), 'Ownable: caller is not the owner');
        });

        it('should not allow activate fcfs from non owner', async () => {
            await expectRevert(presaleActivateFcfs(bob), 'Ownable: caller is not the owner');
        });

        it('should not allow end from non owner', async () => {
            await expectRevert(presaleEnd(bob, dick), 'Ownable: caller is not the owner');
        });

        it('should not allow adding contributors from non owner', async () => {
            await expectRevert(presaleAddContributors([], bob), 'Ownable: caller is not the owner');
        });
    });

    context('before starting', () => {
        it('should now allow activate fcfs if not started yet', async () => {
            await expectRevert(presaleActivateFcfs(alice), 'Presale is not active.');
        });

        it('should now allow end if not started yet', async () => {
            await expectRevert(presaleEnd(alice, dick), 'Presale is not active.');
        });

        it('should not allow start if insufficient token supply', async () => {
            token = await TokenMock.new(presale.address, ether('325000'));
            await expectRevert(presaleStart([], [], alice), 'Insufficient supply.');
        });

        it('should not allow investments', async () => {
            await expectRevert(send.ether(bob, presale.address, ether('3')), 'Not eligible to participate.');
        });

        it('should set variables correctly on start', async () => {
            await presaleStart([], [bob, curtis], alice);
            expect((await presale.getMaxSupply()).toString()).to.eq(ether(maxSupply).toString());
            expect(await presale.tokenAddress()).to.equal(token.address);
            expect(await presale.pancakeswapPairAddress()).to.equal(pancakeswapPairAddress);
            expect(await presale.buybackAddress()).to.equal(buyback.address);
            expect(await presale.liquidityLockAddress()).to.equal(liquidityLockAddress);
            expect(await presale.pancakeswapRouterAddress()).to.equal(pancakeswapRouter.address);
            expect(await presale.rcFarmAddress()).to.equal(rcFarm.address);
            expect(await presale.rcEthFarmAddress()).to.equal(rcEthFarm.address);
            expect((await presale.collectedAmount()).toString()).to.eq(ether('0').toString());
            expect((await presale.hardcapAmount()).toString()).to.eq(ether('6').toString());
            expect((await presale.maxContributionAmount()).toString()).to.eq(ether('3').toString());
            expect(await presale.isPrivateRoundActive()).to.be.true;
            expect(await presale.isPresaleActive()).to.be.false;
            expect(await presale.isFcfsActive()).to.be.false;
            expect(await presale.wasPresaleEnded()).to.be.false;
            expect(await presale.isWhitelisted(bob)).to.be.true;
            expect(await presale.isWhitelisted(curtis)).to.be.true;
            expect(await presale.isWhitelisted(dick)).to.be.false;
            expect((await presale.contribution(bob)).toString()).to.eq(ether('0').toString());
            expect((await presale.contribution(curtis)).toString()).to.eq(ether('0').toString());
            expect((await presale.contribution(dick)).toString()).to.eq(ether('0').toString());
        });
    });

    context('after start', () => {
        beforeEach(async () => {
            await presaleStart([greg], [bob, curtis], alice);
        });

        it('should not allow double start', async () => {
            await expectRevert(presaleStart([], [], alice, false), 'Private round is active.');
        });

        it('should not allow investment from non whitelisted address', async () => {
            await expectRevert(send.ether(dick, presale.address, ether('3')), 'Not eligible to participate.');
        });

        it('should allow investment from whitelisted address', async () => {
            let result = await sendEther(greg, ether('3'));
            expectEvent(result, 'ContributionAccepted', {
                _contributor: greg,
                _partialContribution: ether('3'),
                _totalContribution: ether('3'),
                _receivedTokens: ether('30000000'),
                _contributions: ether('3'),
            });

            await expectRevert(sendEther(bob, ether('3')), 'Not eligible to participate.');
            await presaleActivatePresale();

            result = await sendEther(bob, ether('3'));
            expectEvent(result, 'ContributionAccepted', {
                _contributor: bob,
                _partialContribution: ether('3'),
                _totalContribution: ether('3'),
                _receivedTokens: ether('30000000'),
                _contributions: ether('6'),
            });
            const balance = await token.balanceOf(bob);
            expect(balance.toString()).to.eq(ether('30000000').toString());
        });

        it('should allow multiple investments from whitelisted address', async () => {
            await sendEther(greg, ether('1'));
            await presaleActivatePresale();
            await sendEther(bob, ether('1'));
            let balance = await token.balanceOf(bob);
            expect(balance.toString()).to.eq(ether('10000000').toString());
            balance = await token.balanceOf(greg);
            expect(balance.toString()).to.eq(ether('10000000').toString());
        });

        it('should allow multiple investments up to max from whitelisted address', async () => {
            await presaleActivatePresale();
            await sendEther(bob, ether('1'));
            await sendEther(bob, ether('1'));
            await sendEther(bob, ether('1'));
            const balance = await token.balanceOf(bob);
            expect(balance.toString()).to.eq(ether('30000000').toString());
        });

        it('should allow multiple investments over max and return the excess from whitelisted address', async () => {
            await presaleActivatePresale();

            const tracker = await balance.tracker(bob);
            await sendEther(bob, ether('1'));
            let bobContribution = await presale.contribution(bob);
            expect(bobContribution.toString()).to.eq(ether('1').toString());

            await sendEther(bob, ether('1'));
            bobContribution = await presale.contribution(bob);
            expect(bobContribution.toString()).to.eq(ether('2').toString());

            await sendEther(bob, ether('2'));
            bobContribution = await presale.contribution(bob);
            expect(bobContribution.toString()).to.eq(ether('3').toString());

            const delta = await tracker.delta();
            expect(delta.toString()).to.eq(ether('-3').toString());

            const bobTokenBalance = await token.balanceOf(bob);
            expect(bobTokenBalance.toString()).to.eq(ether('30000000').toString());
        });

        it('should start fcfs correctly', async () => {
            await presaleActivatePresale();
            await presaleActivateFcfs(alice);
            expect(await presale.isFcfsActive()).to.be.true;
        });
    });

    context('after allowing contributions from all', () => {
        const testEndPresaleSuccessfully = async (
            bobContribution,
            dickContribution,
            buybackEths,
            liquidityEths,
            liquidityTokens,
            teamEths
        ) => {
            await presaleStart([], [bob, curtis], alice);
            await presaleActivatePresale();
            await sendEther(bob, ether(bobContribution.toString()));

            await presaleActivateFcfs(alice);
            await sendEther(dick, ether(dickContribution.toString()));

            const buybackTracker = await balance.tracker(buyback.address);
            const teamTracker = await balance.tracker(earl);
            await presaleEnd(alice, earl);

            const buybackDelta = await buybackTracker.delta();
            const buybackEthAmount = ether(buybackEths.toString());
            expect(buybackDelta.toString()).to.eq(buybackEthAmount.toString());

            const liquidityEthAmount = ether(liquidityEths.toString());
            const liquidityTokenAmount = ether(liquidityTokens.toString());
            await pancakeswapRouter.addLiquidityETHShouldBeCalledWith(
                liquidityEthAmount,
                token.address,
                liquidityTokenAmount,
                liquidityTokenAmount,
                liquidityEthAmount,
                liquidityLockAddress
            );
            const minTokensToHoldForBuybackCall = ether('30000000');
            await buyback.initShouldBeCalledWith(
                buybackEthAmount,
                token.address,
                pancakeswapRouter.address,
                minTokensToHoldForBuybackCall
            );
            await token.burnDistributorTokensAndUnlockShouldBeCalled();
            await rcFarm.startFarmingShouldBeCalledWith(token.address, token.address);
            await rcEthFarm.startFarmingShouldBeCalledWith(token.address, pancakeswapPairAddress);

            expect((await token.balanceOf(rcFarm.address)).toString()).to.eq(ether('100000000').toString());
            expect((await token.balanceOf(rcEthFarm.address)).toString()).to.eq(ether('160000000').toString());

            const teamDelta = await teamTracker.delta();
            const teamEthAmount = ether(teamEths.toString());
            expect(teamDelta.toString()).to.eq(teamEthAmount.toString());

            expect(await presale.isPresaleActive()).to.be.false;
            expect(await presale.wasPresaleEnded()).to.be.true;
        };

        it('should allow investment from non whitelisted addresses if fcfs active', async () => {
            await presaleStart([], [bob, curtis], alice);
            await presaleActivatePresale();
            await expectRevert(send.ether(dick, presale.address, ether('2')), 'Not eligible to participate.');
            await presaleActivateFcfs(alice);

            const tracker = await balance.tracker(dick);
            await sendEther(dick, ether('2'));
            const delta = await tracker.delta();
            expect(delta.toString()).to.eq(ether('-2').toString());

            const dickTokenBalance = await token.balanceOf(dick);
            expect(dickTokenBalance.toString()).to.eq(ether('20000000').toString());
        });

        it('should end presale successfully', async () => {
            await testEndPresaleSuccessfully(3, 3, 2.4, 1.2, 7500000, 2.4);
        });

        it('should end presale successfully with partially collected funds', async () => {
            await testEndPresaleSuccessfully(1.5, 1.5, 1.2, 0.6, 3750000, 1.2);
        });
    });

    context('after stoping', () => {
        beforeEach(async () => {
            await presaleStart([], [bob, curtis], alice);
            await presaleActivatePresale();
            await presaleEnd(alice, dick);
        });

        it('should not allow investments after finished presale', async () => {
            await expectRevert(sendEther(bob, ether('3')), 'Not eligible to participate.');
        });

        it('should not allow restart after finished presale', async () => {
            await expectRevert(presaleStart([], [], alice, false), 'Presale was ended.');
        });
    });

    context('softcap not reached', () => {
        beforeEach(async () => {
            await presaleStart([curtis], [], alice);
            await sendEther(curtis, ether('0.5'));
            await presaleActivatePresale();
            await presaleEnd(alice, dick);
        });

        it('should enable refund claim', async () => {
            const tracker = await balance.tracker(presale.address);
            await presale.claimRefund({ from: curtis });
            const delta = await tracker.delta();
            expect(delta.toString()).to.equal(ether('-0.5').toString());
        });

        it('should not allow double refunds', async () => {
            await presale.claimRefund({ from: curtis });
            await expectRevert(presale.claimRefund({ from: curtis }), 'Refund already claimed.');
        });
    });
});
