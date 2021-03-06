const Token = artifacts.require('Token');
const TokenDistributorMock = artifacts.require('TokenDistributorMock');
const TransferLimiterMock = artifacts.require('TransferLimiterMock');
const { deployProxy } = require('@openzeppelin/truffle-upgrades');
const { expect } = require('chai');
const { expectRevert, ether } = require('@openzeppelin/test-helpers');

contract('Token', (accounts) => {
    let tokenDistributor;
    let transferLimiter;
    let token;
    const [alice, bob, curtis, dick, earl, frank] = accounts;
    const treasuryAddress = frank;
    const uniswapPairAddress = curtis;
    const rcFarmAddress = dick;
    const rcEthFarmAddress = earl;

    beforeEach(async () => {
        tokenDistributor = await TokenDistributorMock.new(ether('1000'));
        transferLimiter = await TransferLimiterMock.new();
        token = await Token.new();
        await token.initialize(
            'RollerCoaster',
            'ROLL',
            tokenDistributor.address,
            treasuryAddress,
            transferLimiter.address,
            rcFarmAddress,
            rcEthFarmAddress
        );
        await token.setUniswapPair(uniswapPairAddress);
    });

    context('proxy', () => {
        it('should deploy proxy successfully', async () => {
            token = await deployProxy(Token, [
                'RollerCoasterProxy',
                'ROLLP',
                tokenDistributor.address,
                treasuryAddress,
                transferLimiter.address,
                rcFarmAddress,
                rcEthFarmAddress,
            ]);
            expect(await token.name()).to.eq('RollerCoasterProxy');
            expect(await token.symbol()).to.eq('ROLLP');
        });
    });

    context('init', () => {
        it('should initialize and mint tokens to distributor', async () => {
            const mintAmount = await tokenDistributor.getMaxSupply();
            const presaleBalance = await token.balanceOf(tokenDistributor.address);
            expect(mintAmount.toString()).to.eq(presaleBalance.toString());
        });

        it('should allow token transfers only from distributor prior to unlock', async () => {
            await tokenDistributor.transfer(token.address, alice, ether('1'));
            const aliceBalance = await token.balanceOf(alice);
            expect(aliceBalance.toString()).to.eq(ether('1').toString());
            await expectRevert(token.transfer(bob, ether('1')), 'Tokens are not transferable.');
        });

        it('should not allow setting uniswap pair twice', async () => {
            await expectRevert(token.setUniswapPair(bob), 'Uniswap pair is already set.');
        });

        it('should burn distributor tokens and unlock transfers', async () => {
            await tokenDistributor.transfer(token.address, alice, ether('1'));
            await tokenDistributor.burnDistributorTokensAndUnlock(token.address);

            const distributorBalance = await token.balanceOf(tokenDistributor.address);
            expect(distributorBalance.toString()).to.eq(ether('0').toString());

            await token.transfer(bob, ether('1'));
            const aliceBalance = await token.balanceOf(alice);
            const bobBalance = await token.balanceOf(bob);
            expect(aliceBalance.toString()).to.eq(ether('0').toString());
            expect(bobBalance.isZero()).to.be.false;
        });
    });

    context('sell limiting', () => {
        beforeEach(async () => {
            await transferLimiter.setTransferLimitPerETH(ether('2'));
        });

        it('should limit sell transactions', async () => {
            await tokenDistributor.transfer(token.address, uniswapPairAddress, ether('1'));
            await expectRevert(
                tokenDistributor.transfer(token.address, uniswapPairAddress, ether('1.1')),
                'Transfer amount is too big.'
            );
        });

        it('should not limit transaction not sent to uniswap pair address', async () => {
            await tokenDistributor.transfer(token.address, alice, ether('5'));
        });
    });

    context('burning', () => {
        beforeEach(async () => {
            await tokenDistributor.transfer(token.address, alice, ether('10'));
            await tokenDistributor.transfer(token.address, uniswapPairAddress, ether('10'));
            await tokenDistributor.transfer(token.address, treasuryAddress, ether('10'));
            await tokenDistributor.transfer(token.address, rcFarmAddress, ether('10'));
            await tokenDistributor.transfer(token.address, rcEthFarmAddress, ether('10'));
            await tokenDistributor.burnDistributorTokensAndUnlock(token.address);
        });

        it('should not burn nonburnable sender or recipient transfers', async () => {
            await token.transfer(tokenDistributor.address, ether('1')); // send from alice
            const tdBalance = await token.balanceOf(tokenDistributor.address);
            expect(tdBalance.toString()).to.eq(ether('1').toString());

            await tokenDistributor.transfer(token.address, bob, ether('1'));
            const bobBalance = await token.balanceOf(bob);
            expect(bobBalance.toString()).to.eq(ether('1').toString());

            const testNonBurn = async (nonBurnAddress) => {
                let startBalance = await token.balanceOf(nonBurnAddress);
                await token.transfer(nonBurnAddress, ether('1')); // send from alice
                let endBalance = await token.balanceOf(nonBurnAddress);
                expect(endBalance.sub(startBalance).toString()).to.eq(ether('1').toString());

                startBalance = await token.balanceOf(bob);
                await token.transfer(bob, ether('1'), { from: nonBurnAddress });
                endBalance = await token.balanceOf(bob);
                expect(endBalance.sub(startBalance).toString()).to.eq(ether('1').toString());
            };
            await testNonBurn(treasuryAddress);
            await testNonBurn(rcFarmAddress);
            await testNonBurn(rcEthFarmAddress);
        });

        it('should burn tokens when sending to uniswap router but not vice verca', async () => {
            await token.transfer(uniswapPairAddress, ether('1'));
            const uniswapBalance = await token.balanceOf(uniswapPairAddress);
            expect(uniswapBalance.toString()).to.eq(ether('10.95').toString());
            const treasuryBalance = await token.balanceOf(treasuryAddress);
            expect(treasuryBalance.toString()).to.eq(ether('10.05').toString());

            await token.transfer(bob, ether('5'), { from: uniswapPairAddress });
            const bobBalance = await token.balanceOf(bob);
            expect(bobBalance.toString()).to.eq(ether('5').toString());
        });

        it('should burn wallet to wallet token transfers', async () => {
            await token.transfer(bob, ether('1'));
            const bobBalance = await token.balanceOf(bob);
            expect(bobBalance.toString()).to.eq(ether('0.95').toString());
            const treasuryBalance = await token.balanceOf(treasuryAddress);
            expect(treasuryBalance.toString()).to.eq(ether('10.05').toString());
        });
    });
});
