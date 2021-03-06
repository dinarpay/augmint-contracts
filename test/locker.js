/* TODO: create lockHelpers to make this test more readable and manegable */
const Locker = artifacts.require("Locker");
const tokenTestHelpers = require("./helpers/tokenTestHelpers.js");

const testHelpers = require("./helpers/testHelpers.js");

const BN = web3.utils.BN;

const LOCK_MAX_GAS = 230000;
const RELEASE_MAX_GAS = 80000;

let tokenHolder = "";
let interestEarnedAddress = "";
let lockerInstance = null;
let augmintToken = null;
let monetarySupervisor = null;
let CHUNK_SIZE = 10;

const ltdParams = { lockDifferenceLimit: 300000, loanDifferenceLimit: 200000, allowedDifferenceAmount: 100000 };

contract("Locker", (accounts) => {
    before(async function () {
        tokenHolder = accounts[1];

        [augmintToken, lockerInstance] = await Promise.all([tokenTestHelpers.augmintToken, Locker.at(Locker.address)]);

        monetarySupervisor = tokenTestHelpers.monetarySupervisor;

        interestEarnedAddress = tokenTestHelpers.interestEarnedAccount.address;

        await Promise.all([
            monetarySupervisor.setLtdParams(
                ltdParams.lockDifferenceLimit,
                ltdParams.loanDifferenceLimit,
                ltdParams.allowedDifferenceAmount
            ),
            tokenTestHelpers.issueToken(accounts[0], tokenHolder, 40000),
            tokenTestHelpers.issueToken(accounts[0], interestEarnedAddress, 10000),
        ]);
    });

    it("Verifies default test lockproduct interest rates", async function () {
        // correlates with lock products set up in localTest_initialSetup.sol

        // IRPA: Interest Rate Per Annum : the percentage value on the UI
        // PTI: Per Term Interest : uint32 perTermInterest constructor parameter

        // IRPA = (PTI / 1_000_000) * (365 / termInDays)
        // PTI = (IRPA * 1_000_000) * (termInDays / 365)

        const toPti = (irpa, termInDays) => Math.ceil(irpa * 1000000 * (termInDays / 365));

        const p = await lockerInstance.getLockProducts(0, CHUNK_SIZE);
        assert.equal(p[0][0].toNumber(), toPti(0.12, 365));
        assert.equal(p[1][0].toNumber(), toPti(0.115, 180));
        assert.equal(p[2][0].toNumber(), toPti(0.11, 90));
        assert.equal(p[3][0].toNumber(), toPti(0.105, 60));
        assert.equal(p[4][0].toNumber(), toPti(0.1, 30));
        assert.equal(p[5][0].toNumber(), toPti(0.1, 14));
        assert.equal(p[6][0].toNumber(), toPti(0.1, 7));
    });

    it("should allow lock products to be created", async function () {
        // create lock product with 5% per term, and 60 sec lock time:
        const tx = await lockerInstance.addLockProduct(50000, 60, 100, true);
        testHelpers.logGasUse(this, tx, "addLockProduct");

        await testHelpers.assertEvent(lockerInstance, "NewLockProduct", {
            lockProductId: (x) => x,
            perTermInterest: "50000",
            durationInSecs: "60",
            minimumLockAmount: "100",
            isActive: true,
        });
    });

    it("should allow the number of lock products to be queried", async function () {
        const startingNumLocks = (await lockerInstance.getLockProductCount()).toNumber();

        // create lock product with 5% per term, and 120 sec lock time:
        const tx = await lockerInstance.addLockProduct(50000, 120, 0, true);
        testHelpers.logGasUse(this, tx, "addLockProduct");

        const endNumLocks = (await lockerInstance.getLockProductCount()).toNumber();

        assert(startingNumLocks + 1 === endNumLocks);
    });

    it("should allow the getting of individual lock products", async function () {
        // create lock product with 8% per term, and 120 sec lock time:
        const tx = await lockerInstance.addLockProduct(80000, 120, 50, true);
        testHelpers.logGasUse(this, tx, "addLockProduct");

        const numLocks = (await lockerInstance.getLockProductCount()).toNumber();

        const prod = await lockerInstance.lockProducts(numLocks - 1);

        assert.equal(prod.perTermInterest, "80000");
        assert.equal(prod.durationInSecs, "120");
        assert.equal(prod.minimumLockAmount, "50");
        assert(prod.isActive, "product should be  in active state");
    });

    it("should allow the listing of lock products (0 offset)", async function () {
        // create lock product with 10% per term, and 120 sec lock time:
        const tx = await lockerInstance.addLockProduct(100000, 120, 75, true);
        testHelpers.logGasUse(this, tx, "addLockProduct");

        const numLocks = await lockerInstance.getLockProductCount().then((res) => res.toNumber());
        const products = await lockerInstance.getLockProducts(0, numLocks);

        // getLockProducts should return a <numLocks> element array:
        assert.isArray(products);
        assert(products.length === numLocks);

        const newestProduct = products[numLocks - 1];

        // each product should be a 5 element array
        assert.isArray(newestProduct);
        assert(newestProduct.length === 5);

        // the products should be [ perTermInterest, durationInSecs, maxLockAmount, isActive ]
        const [perTermInterest, durationInSecs, minimumLockAmount, maxLockAmount, isActive] = newestProduct;
        assert(perTermInterest.toNumber() === 100000);
        assert(durationInSecs.toNumber() === 120);
        assert(minimumLockAmount.toNumber() === 75);
        const expMaxLockAmount = await monetarySupervisor.getMaxLockAmount(minimumLockAmount, perTermInterest);
        assert.equal(maxLockAmount.toString(), expMaxLockAmount.toString());
        assert(isActive.toNumber() === 1);
    });

    it("should allow the listing of lock products (non-zero offset)", async function () {
        const offset = 1;

        const products = await lockerInstance.getLockProducts(offset, CHUNK_SIZE);

        assert.isArray(products);
        assert(products.length <= CHUNK_SIZE);

        const product = products[0];

        // each product should be a 5 element array
        assert.isArray(product);
        assert.equal(product.length, 5, "number of products");

        // the products should be [ perTermInterest, durationInSecs, maxLockAmount, isActive ]
        const [perTermInterest, durationInSecs, minimumLockAmount, maxLockAmount, isActive] = product;

        const expProd = await lockerInstance.lockProducts(offset);

        const expMaxLockAmount = await monetarySupervisor.getMaxLockAmount(
            expProd.minimumLockAmount,
            expProd.perTermInterest
        );

        assert.equal(perTermInterest.toString(), expProd.perTermInterest.toString(), "perTermInterest");
        assert.equal(durationInSecs.toString(), expProd.durationInSecs.toString(), "durationInSecs");
        assert.equal(minimumLockAmount.toString(), expProd.minimumLockAmount.toString(), "minimumLockAmount");
        assert.equal(maxLockAmount.toString(), expMaxLockAmount.toString(), "maxLockAmount");
        assert.equal(isActive, expProd.isActive, "isActive");
    });

    it("should allow the listing of lock products when there are more than CHUNK_SIZE products");

    it("should allow lock products to be enabled/disabled", async function () {
        const lockProductId = 0;

        const tx = await lockerInstance.setLockProductActiveState(lockProductId, false);
        testHelpers.logGasUse(this, tx, "setLockProductActiveState");

        await testHelpers.assertEvent(lockerInstance, "LockProductActiveChange", {
            lockProductId: lockProductId.toString(),
            newActiveState: false,
        });

        let product = await lockerInstance.lockProducts(lockProductId);

        assert(product[3] === false);

        await lockerInstance.setLockProductActiveState(lockProductId, true);

        await testHelpers.assertEvent(lockerInstance, "LockProductActiveChange", {
            lockProductId: lockProductId.toString(),
            newActiveState: true,
        });

        product = await lockerInstance.lockProducts(lockProductId);

        assert(product[3] === true);
    });

    it("should allow tokens to be locked", async function () {
        const [startingBalances, totalLockAmountBefore, expectedLockId] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCount(),
        ]);
        const amountToLock = 1000;

        // lock funds, and get the product that was used:
        const [product, lockingTransaction] = await Promise.all([
            lockerInstance.lockProducts(0),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, {
                from: tokenHolder,
            }),
        ]);
        testHelpers.logGasUse(this, lockingTransaction, "transferAndNotify - lockFunds");

        const perTermInterest = product[0].toNumber();
        const durationInSecs = product[1].toNumber();
        const interestEarned = Math.ceil((amountToLock * perTermInterest) / 1000000);

        // need the block to get the timestamp to check lockedUntil in NewLock event:
        const block = await web3.eth.getBlock(lockingTransaction.receipt.blockHash);
        const expectedLockedUntil = block.timestamp + durationInSecs;
        // sanity check:
        assert(expectedLockedUntil > Math.floor(Date.now() / 1000));

        const [totalLockAmountAfter, ,] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),

            testHelpers.assertEvent(lockerInstance, "NewLock", {
                lockOwner: tokenHolder,
                lockId: expectedLockId.toString(),
                amountLocked: amountToLock.toString(),
                interestEarned: interestEarned.toString(),
                lockedUntil: expectedLockedUntil.toString(),
                perTermInterest: perTermInterest.toString(),
                durationInSecs: durationInSecs.toString(),
            }),

            // TODO: events are emitted but can't retrieve them
            // testHelpers.assertEvent(augmintToken, "Transfer", {
            //     from: tokenHolder,
            //     to: lockerInstance.address,
            //     amount: amountToLock
            // }),
            //
            // testHelpers.assertEvent(augmintToken, "AugmintTransfer", {
            //     from: tokenHolder,
            //     to: lockerInstance.address,
            //     amount: amountToLock,
            //     fee: 0,
            //     narrative: "Funds locked"
            // })

            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: {
                    ace: startingBalances.tokenHolder.ace.sub(new BN(amountToLock)),
                    gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE,
                },
                lockerInstance: { ace: startingBalances.lockerInstance.ace.add(new BN(amountToLock + interestEarned)) },
                interestEarned: { ace: startingBalances.interestEarned.ace.sub(new BN(interestEarned)) },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.add(new BN(amountToLock)).toString(),
            "totalLockedAmount should be increased by locked amount "
        );
    });

    it("should not allow to lock with an inactive lockproduct", async function () {
        await lockerInstance.addLockProduct(50000, 60, 100, false);
        const newLockProductId = (await lockerInstance.getLockProductCount()) - 1;
        await testHelpers.expectThrow(
            augmintToken.transferAndNotify(lockerInstance.address, 10000, newLockProductId, {
                from: tokenHolder,
            })
        );
    });

    it("should allow an account to see how many locks it has", async function () {
        const startingNumLocks = (await lockerInstance.getLockCountForAddress(tokenHolder)).toNumber();
        const amountToLock = 1000;

        await augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, {
            from: tokenHolder,
        });

        const finishingNumLocks = (await lockerInstance.getLockCountForAddress(tokenHolder)).toNumber();

        assert(finishingNumLocks === startingNumLocks + 1);
    });

    it("should allow tokens to be unlocked", async function () {
        const [startingBalances, addProdTx] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            // create lock product with 10% per term, and 1 sec lock time:
            lockerInstance.addLockProduct(100000, 1, 0, true),
        ]);
        testHelpers.logGasUse(this, addProdTx, "addLockProduct");

        const amountToLock = 1000;
        const interestEarned = Math.ceil(amountToLock / 10); // 10%
        const newLockProductId = (await lockerInstance.getLockProductCount()) - 1;

        const lockTx = await augmintToken.transferAndNotify(lockerInstance.address, amountToLock, newLockProductId, {
            from: tokenHolder,
        });
        testHelpers.logGasUse(this, lockTx, "transferAndNotify - lockFunds");

        const [totalLockAmountBefore, newestLockId] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCount().then((res) => res - 1),
        ]);

        const lockedUntil = (await lockerInstance.locks(newestLockId))[3].toNumber();
        await testHelpers.waitForTimeStamp(lockedUntil);

        const releaseTx = await lockerInstance.releaseFunds(newestLockId);
        testHelpers.logGasUse(this, releaseTx, "releaseFunds");

        const [totalLockAmountAfter, , , ,] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),

            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: {
                    ace: startingBalances.tokenHolder.ace.add(new BN(interestEarned)),
                    gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE + RELEASE_MAX_GAS * testHelpers.GAS_PRICE,
                },
                lockerInstance: { ace: startingBalances.lockerInstance.ace },
                interestEarned: { ace: startingBalances.interestEarned.ace.sub(new BN(interestEarned)) },
            }),

            testHelpers.assertEvent(lockerInstance, "LockReleased", {
                lockOwner: tokenHolder,
                lockId: newestLockId.toString(),
            }),

            testHelpers.assertEvent(augmintToken, "AugmintTransfer", {
                from: lockerInstance.address,
                to: tokenHolder,
                amount: (amountToLock + interestEarned).toString(),
                fee: "0",
                narrative: "Funds released from lock",
            }),

            testHelpers.assertEvent(augmintToken, "Transfer", {
                from: lockerInstance.address,
                to: tokenHolder,
                amount: (amountToLock + interestEarned).toString(),
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.sub(new BN(amountToLock)).toString(),
            "totalLockedAmount should be the decrased by released amount (w/o interest) after release "
        );
    });

    it("should allow an account to see it's individual locks", async function () {
        const amountToLock = 1000;

        // lock funds, and get the product that was used:
        const [product, lockingTransaction] = await Promise.all([
            lockerInstance.lockProducts(0),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
        ]);

        const expectedDurationInSecs = product[1].toNumber();

        // need the block to get the timestamp to check lockedUntil in NewLock event:
        const block = await web3.eth.getBlock(lockingTransaction.receipt.blockHash);
        const expectedLockedUntil = block.timestamp + expectedDurationInSecs;
        // sanity check:
        assert(expectedLockedUntil > Math.floor(Date.now() / 1000));

        const numLocks = (await lockerInstance.getLockCountForAddress(tokenHolder)).toNumber();
        const newestLock = await lockerInstance.locks(numLocks - 1);

        // the locks should be [ amountLocked, owner, interestEarned, lockedUntil, perTermInterest, durationInSecs, isActive ]
        assert.equal(newestLock.owner, tokenHolder, "owner");
        assert.equal(newestLock.amountLocked, amountToLock.toString(), "amountLocked");
        assert.equal(newestLock.productId, "0", "productId");
        assert.equal(newestLock.lockedUntil, expectedLockedUntil.toString(), "lockedUntil");
        assert(newestLock.isActive, "isActive");
    });

    it("should allow to list all locks (0 offset)");

    it("should allow to list all locks (non-zero offset)", async function () {
        const amountToLock = 1000;
        const [product, lockingTransaction, ,] = await Promise.all([
            lockerInstance.lockProducts(0),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
        ]);

        const expectedPerTermInterest = product[0].toNumber();
        const expectedDurationInSecs = product[1].toNumber();
        const expectedInterestEarned = Math.ceil((amountToLock * expectedPerTermInterest) / 1000000);

        // need the block to get the timestamp to check lockedUntil in NewLock event:
        const block = await web3.eth.getBlock(lockingTransaction.receipt.blockHash);
        const expectedLockedUntil = block.timestamp + expectedDurationInSecs;
        // sanity check:
        assert(expectedLockedUntil > Math.floor(Date.now() / 1000));

        const lockCount = await lockerInstance.getLockCount();
        //const lockId1 = lockCount - 3;
        const lockId2 = lockCount - 2;
        const lockId3 = lockCount - 1;

        const offset = lockCount - 2;
        const locks = await lockerInstance.getLocks(offset, CHUNK_SIZE);

        assert(locks.length <= CHUNK_SIZE);

        const lock2 = locks[0];
        // the locks should be [ lockId, owner, amountLocked, interestEarned, lockedUntil, perTermInterest, durationInSecs, isActive ]
        const [
            lockId,
            owner,
            amountLocked,
            interestEarned,
            lockedUntil,
            perTermInterest,
            durationInSecs,
            isActive,
        ] = lock2;
        assert.equal(lockId.toNumber(), lockId2);
        assert.equal(
            "0x" + owner.toString(16).padStart(40, "0"), // leading 0s if address starts with 0
            tokenHolder.toLowerCase()
        );
        assert.equal(amountLocked.toNumber(), amountToLock, "amountLocked");
        assert.equal(interestEarned.toNumber(), expectedInterestEarned, "interestEarned");
        assert.isAtLeast(lockedUntil.toNumber(), expectedLockedUntil, "lockedUntil");
        assert.equal(perTermInterest.toNumber(), expectedPerTermInterest, "perTermInterest");
        assert.equal(durationInSecs.toNumber(), expectedDurationInSecs, "durationInSecs");
        assert(isActive, "isActive");

        const lock3 = locks[1];
        assert.equal(lock3[0].toNumber(), lockId3);
    });

    it("should allow to list all locks when it has more than CHUNK_SIZE locks");

    it("should allow to list an account's locks (0 offset)", async function () {
        // NB: this test assumes that tokenHolder has less than CHUNK_SIZE locks (when checking newestLock)

        const amountToLock = 1000;

        // lock funds, and get the product that was used:
        const [product, lockingTransaction] = await Promise.all([
            lockerInstance.lockProducts(0),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
        ]);

        const expectedPerTermInterest = product[0].toNumber();
        const expectedDurationInSecs = product[1].toNumber();
        const expectedInterestEarned = Math.ceil((amountToLock * expectedPerTermInterest) / 1000000);

        // need the block to get the timestamp to check lockedUntil in NewLock event:
        const block = await web3.eth.getBlock(lockingTransaction.receipt.blockHash);
        const expectedLockedUntil = block.timestamp + expectedDurationInSecs;
        // sanity check:
        assert(expectedLockedUntil > Math.floor(Date.now() / 1000));

        const expectedLockId = (await lockerInstance.getLockCount()) - 1;
        const expectedAccountLockIndex = (await lockerInstance.getLockCountForAddress(tokenHolder)) - 1;
        const accountLocks = await lockerInstance.getLocksForAddress(tokenHolder, expectedAccountLockIndex, CHUNK_SIZE);

        assert.isArray(accountLocks);
        assert(accountLocks.length <= CHUNK_SIZE);

        const newestLock = accountLocks[0];

        // each lock should be a 7 element array
        assert.isArray(newestLock);
        assert(newestLock.length === 7);

        // the locks should be [ owner, amountLocked, interestEarned, lockedUntil, perTermInterest, durationInSecs, isActive ]
        const [
            lockId,
            amountLocked,
            interestEarned,
            lockedUntil,
            perTermInterest,
            durationInSecs,
            isActive,
        ] = newestLock;
        assert(lockId.toNumber() === expectedLockId);
        assert(amountLocked.toNumber() === amountToLock);
        assert(interestEarned.toNumber() === expectedInterestEarned);
        assert(lockedUntil.toNumber() === expectedLockedUntil);
        assert(perTermInterest.toNumber() === expectedPerTermInterest);
        assert(durationInSecs.toNumber() === expectedDurationInSecs);
        assert(isActive.toNumber() === 1);
    });

    it("should allow to list an account's locks (non-zero offset)", async function () {
        const amountToLock = 1000;

        // lock funds, and get the product that was used:
        const [product] = await Promise.all([
            lockerInstance.lockProducts(0),
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder }),
        ]);

        const expectedPerTermInterest = product[0].toNumber();
        const expectedDurationInSecs = product[1].toNumber();
        const expectedInterestEarned = Math.ceil((amountToLock * expectedPerTermInterest) / 1000000);

        const expectedAccountLockIndex = (await lockerInstance.getLockCountForAddress(tokenHolder)) - 1;

        const accountLocks = await lockerInstance.getLocksForAddress(tokenHolder, expectedAccountLockIndex, CHUNK_SIZE);

        assert.isArray(accountLocks);
        assert(accountLocks.length <= CHUNK_SIZE, "number of owner's locks returned");

        const lock = accountLocks[0];

        // each lock should be a 7 element array
        assert.isArray(lock);
        assert.equal(lock.length, 7, "locks array length");

        const expectedLockId = (await lockerInstance.getLockCount()) - 1;

        const expectedLock = await lockerInstance.locks(expectedLockId);

        // the locks should be [ owner, amountLocked, interestEarned, lockedUntil, perTermInterest, durationInSecs, isActive ]
        const [lockId, amountLocked, interestEarned, lockedUntil, perTermInterest, durationInSecs, isActive] = lock;

        assert.equal(lockId.toNumber(), expectedLockId, "lockId");
        assert.equal(expectedLock.owner, tokenHolder, "owner");
        assert.equal(expectedLock.productId.toNumber(), 0, "productId");
        assert.equal(amountLocked.toNumber(), expectedLock.amountLocked.toNumber(), "amountLocked");
        assert.equal(interestEarned.toNumber(), expectedInterestEarned, "interestEarned");
        assert.equal(lockedUntil.toNumber(), expectedLock.lockedUntil.toNumber(), "lockedUntil");
        assert.equal(perTermInterest.toNumber(), expectedPerTermInterest, "perTermInterest");
        assert.equal(durationInSecs.toNumber(), expectedDurationInSecs, "durationInSecs");
        assert.equal(isActive, expectedLock.isActive, "isActive");
    });

    it("should allow to list an account's locks when it has more than CHUNK_SIZE locks");

    it("should prevent someone from locking more tokens than they have", async function () {
        const [startingBalances, totalLockAmountBefore, startingNumLocks] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
        ]);

        const amountToLock = startingBalances.tokenHolder.ace + 1000;

        await testHelpers.expectThrow(
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, { from: tokenHolder })
        );
        await testHelpers.assertNoEvents(lockerInstance, "NewLock");

        const [totalLockAmountAfter, finishingNumLocks] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: { ace: startingBalances.tokenHolder.ace, gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE },
                lockerInstance: { ace: startingBalances.lockerInstance.ace },
                interestEarned: { ace: startingBalances.interestEarned.ace },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.toString(),
            "totalLockedAmount shouldn't change"
        );

        assert.equal(finishingNumLocks.toNumber(), startingNumLocks.toNumber(), "number of locks shouldn't change");
    });

    it("should prevent someone from depleting the interestEarnedAccount via locking", async function () {
        // create lock product with 100% per term interest:
        await lockerInstance.addLockProduct(1000000, 120, 0, true);
        const newLockProductId = (await lockerInstance.getLockProductCount()).toNumber() - 1;

        const [startingBalances, totalLockAmountBefore, startingNumLocks] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
        ]);

        const amountToLock = startingBalances.interestEarned.ace.add(new BN(1));

        // this is less a test for the code, a more a sanity check for the test
        // (so that the lockFunds doesn't fail due to tokenHolder having insufficient funds):

        assert(startingBalances.tokenHolder.ace.gte(amountToLock));

        await testHelpers.expectThrow(
            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, newLockProductId, {
                from: tokenHolder,
            })
        );
        await testHelpers.assertNoEvents(lockerInstance, "NewLock");

        const [totalLockAmountAfter, finishingNumLocks] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: { ace: startingBalances.tokenHolder.ace, gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE },
                lockerInstance: { ace: startingBalances.lockerInstance.ace },
                interestEarned: { ace: startingBalances.interestEarned.ace },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.toString(),
            "totalLockedAmount shouldn't change"
        );

        assert.equal(finishingNumLocks.toNumber(), startingNumLocks.toNumber(), "number of locks shouldn't change");
    });

    it("should prevent someone from locking less than the minimumLockAmount", async function () {
        const minimumLockAmount = 1000;

        // create lock product with token minimum:
        await lockerInstance.addLockProduct(100000, 2, minimumLockAmount, true);

        const newLockProductId = (await lockerInstance.getLockProductCount()).toNumber() - 1;

        // can't lock less than the minimumLockAmount:
        await testHelpers.expectThrow(
            augmintToken.transferAndNotify(lockerInstance.address, minimumLockAmount - 1, newLockProductId, {
                from: tokenHolder,
            })
        );
    });

    it("should allow someone to lock exactly the minimum", async function () {
        const [startingBalances, totalLockAmountBefore, startingNumLocks] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
        ]);

        const minimumLockAmount = 1000;

        await lockerInstance.addLockProduct(100000, 2, minimumLockAmount, true);

        const newLockProductId = (await lockerInstance.getLockProductCount()).toNumber() - 1;

        const tx = await augmintToken.transferAndNotify(lockerInstance.address, minimumLockAmount, newLockProductId, {
            from: tokenHolder,
        });
        testHelpers.logGasUse(this, tx, "transferAndNotify - lockFunds");

        const expectedLockId = (await lockerInstance.getLockCount()) - 1;

        const eventResults = await testHelpers.assertEvent(lockerInstance, "NewLock", {
            lockOwner: tokenHolder,
            lockId: expectedLockId.toString(),
            amountLocked: minimumLockAmount.toString(),
            interestEarned: (x) => x,
            lockedUntil: (x) => x,
            perTermInterest: (x) => x,
            durationInSecs: (x) => x,
        });

        const [totalLockAmountAfter, finishingNumLocks] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),

            lockerInstance.getLockCountForAddress(tokenHolder),

            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: {
                    ace: startingBalances.tokenHolder.ace.sub(new BN(minimumLockAmount)),
                    gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE,
                },
                lockerInstance: {
                    ace: startingBalances.lockerInstance.ace
                        .add(new BN(minimumLockAmount))
                        .add(new BN(eventResults.interestEarned)),
                },
                interestEarned: { ace: startingBalances.interestEarned.ace.sub(new BN(eventResults.interestEarned)) },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.add(new BN(minimumLockAmount)).toString(),
            "totalLockedAmount should be increased by locked amount "
        );

        assert.equal(finishingNumLocks.toNumber(), startingNumLocks.toNumber() + 1, "number of locks should be +1");
    });

    it("should prevent someone from releasing a lock early", async function () {
        const amountToLock = 1000;
        const [startingBalances, totalLockAmountBefore] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
        ]);

        // lock funds, and get the product that was used:
        const [product, lockFundsTx] = await Promise.all([
            lockerInstance.lockProducts(0),

            augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, {
                from: tokenHolder,
            }),
        ]);
        testHelpers.logGasUse(this, lockFundsTx, "transferAndNotify - lockFunds");

        const perTermInterest = product[0];
        const interestEarned = Math.ceil((amountToLock * perTermInterest) / 1000000);

        const newestLockId = (await lockerInstance.getLockCount()) - 1;

        await testHelpers.expectThrow(lockerInstance.releaseFunds(newestLockId));

        const [totalLockAmountAfter, ,] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),

            testHelpers.assertNoEvents(lockerInstance, "NewLock"),

            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: {
                    ace: startingBalances.tokenHolder.ace.sub(new BN(amountToLock)),
                    gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE,
                },
                lockerInstance: { ace: startingBalances.lockerInstance.ace.add(new BN(amountToLock + interestEarned)) },
                interestEarned: { ace: startingBalances.interestEarned.ace.sub(new BN(interestEarned)) },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.add(new BN(amountToLock)).toString(),
            "totalLockedAmount should be increased by locked amount "
        );
    });

    it("should prevent someone from unlocking an unlocked lock", async function () {
        const [startingBalances, totalLockAmountBefore, startingNumLocks] = await Promise.all([
            tokenTestHelpers.getAllBalances({
                tokenHolder: tokenHolder,
                lockerInstance: lockerInstance.address,
                interestEarned: interestEarnedAddress,
            }),
            monetarySupervisor.totalLockedAmount(),
            lockerInstance.getLockCountForAddress(tokenHolder),
        ]);
        const amountToLock = 1000;

        // create lock product with 10% per term, and 1 sec lock time:
        await lockerInstance.addLockProduct(100000, 1, 0, true);
        const interestEarned = Math.ceil(amountToLock / 10); // 10%

        const newLockProductId = (await lockerInstance.getLockProductCount()) - 1;

        const lockFundsTx = await augmintToken.transferAndNotify(
            lockerInstance.address,
            amountToLock,
            newLockProductId,
            {
                from: tokenHolder,
            }
        );
        testHelpers.logGasUse(this, lockFundsTx, "transferAndNotify - lockFunds");

        const newestLockId = (await lockerInstance.getLockCount()) - 1;

        const lockedUntil = (await lockerInstance.locks(newestLockId))[3].toNumber();
        await testHelpers.waitForTimeStamp(lockedUntil);

        const releaseTx = await lockerInstance.releaseFunds(newestLockId);
        testHelpers.logGasUse(this, releaseTx, "releaseFunds");

        await testHelpers.expectThrow(lockerInstance.releaseFunds(newestLockId));

        const [totalLockAmountAfter, finishingNumLocks] = await Promise.all([
            monetarySupervisor.totalLockedAmount(),

            lockerInstance.getLockCountForAddress(tokenHolder),

            tokenTestHelpers.assertBalances(startingBalances, {
                tokenHolder: {
                    ace: startingBalances.tokenHolder.ace.add(new BN(interestEarned)),
                    gasFee: LOCK_MAX_GAS * testHelpers.GAS_PRICE + RELEASE_MAX_GAS * testHelpers.GAS_PRICE,
                },
                lockerInstance: {
                    ace: startingBalances.lockerInstance.ace,
                },
                interestEarned: { ace: startingBalances.interestEarned.ace.sub(new BN(interestEarned)) },
            }),
        ]);

        assert.equal(
            totalLockAmountAfter.toString(),
            totalLockAmountBefore.toString(),
            "totalLockedAmount should be the same after release"
        );

        assert.equal(
            finishingNumLocks.toNumber(),
            startingNumLocks.toNumber() + 1,
            "number of locks should be +1 after lock & release"
        );
    });

    it("should only allow whitelisted lock contract to be used", async function () {
        const craftedLocker = await Locker.new(accounts[0], augmintToken.address, monetarySupervisor.address);
        await craftedLocker.grantPermission(accounts[0], web3.utils.asciiToHex("StabilityBoard"));
        await craftedLocker.addLockProduct(1000000, 120, 0, true);
        const newLockProductId = (await craftedLocker.getLockProductCount()).toNumber() - 1;
        await testHelpers.expectThrow(
            augmintToken.transferAndNotify(craftedLocker.address, 10000, newLockProductId, {
                from: tokenHolder,
            })
        );
    });

    it("should only allow the token contract to call transferNotification", async function () {
        await testHelpers.expectThrow(lockerInstance.transferNotification(accounts[0], 1000, 0, { from: accounts[0] }));
    });

    it("only allowed contract should call requestInterest ", async function () {
        const interestAmount = 100;
        // make sure it's not reverting b/c not enough interest
        assert((await augmintToken.balanceOf(interestEarnedAddress)).gte(interestAmount));
        await testHelpers.expectThrow(monetarySupervisor.requestInterest(1000, interestAmount, { from: accounts[0] }));
    });

    it("only allowed contract should call releaseFundsNotification ", async function () {
        const amountToLock = 10000;
        const lockFundsTx = await augmintToken.transferAndNotify(lockerInstance.address, amountToLock, 0, {
            from: tokenHolder,
        });
        testHelpers.logGasUse(this, lockFundsTx, "transferAndNotify - lockFunds");

        await testHelpers.expectThrow(monetarySupervisor.releaseFundsNotification(amountToLock, { from: accounts[0] }));
    });

    it("Should allow to change  monetarySupervisor contract", async function () {
        const newMonetarySupervisor = monetarySupervisor.address;
        const tx = await lockerInstance.setMonetarySupervisor(newMonetarySupervisor);
        testHelpers.logGasUse(this, tx, "setSystemContracts");

        const [actualMonetarySupervisor] = await Promise.all([
            lockerInstance.monetarySupervisor(),
            testHelpers.assertEvent(lockerInstance, "MonetarySupervisorChanged", { newMonetarySupervisor }),
        ]);

        assert.equal(actualMonetarySupervisor, newMonetarySupervisor);
    });

    it("Only allowed should change rates and monetarySupervisor contracts", async function () {
        const newMonetarySupervisor = monetarySupervisor.address;
        await testHelpers.expectThrow(
            lockerInstance.setMonetarySupervisor(newMonetarySupervisor, { from: accounts[1] })
        );
    });
});
