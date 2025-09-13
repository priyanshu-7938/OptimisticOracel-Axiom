const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { TronWeb } = require("tronweb");
const { abi, bytecode } = require("../artifacts/contracts/DelphiToken.sol/DelphiToken.json");

describe("DelphiToken (UMA Clone for Delphi-OO)", function () {
    let DelphiToken, token, owner, minter, burner, user1, user2;
    let tronWeb;
    // Enum from the contract for easy access in tests
    const ROLES = {
        Owner: 0,
        Minter: 1,
        Burner: 2,
    };

    let INITIAL_SUPPLY;

    const PRIVATE_KEYS = {
        owner: "0fb7c161651cd12fa985c9cd725cf65b3f4cea361a3e2c71e408eb1c58693f90",
        minter: "d091748c4fcfe3aaf5d6c09a366dfe9a1fa612f94187268351bcd0c8e4f45c47",
        burner: "4e1b24ca90f7ae32b1c7d16cc7e58db4032d6926f1155b17afa1867db6b1d177",
        user1: "e7a3a69907a1945fcd5579753ef0f44a8f0d63da0b5cca0dcad062475f84539e",
        user2: "8d4aa1f793d191fb12736ebaad76913c74a0cdc48467fd336a3a1986ca2e829d"
    };

    // Before each test, we deploy a fresh contract instance
    before(async function () {
        tronWeb = new TronWeb(
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090", // Default for Tron Quickstart
            PRIVATE_KEYS.owner // Default private key
        );
        INITIAL_SUPPLY = tronWeb.toSun(1000000000);

        owner = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.owner), privateKey: PRIVATE_KEYS.owner };
        minter = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.minter), privateKey: PRIVATE_KEYS.minter };
        burner = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.burner), privateKey: PRIVATE_KEYS.burner };
        user1 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user1), privateKey: PRIVATE_KEYS.user1 };
        user2 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user2), privateKey: PRIVATE_KEYS.user2 };
        owner.balance = await tronWeb.trx.getBalance(owner.address);
        minter.balance = await tronWeb.trx.getBalance(minter.address);
        burner.balance = await tronWeb.trx.getBalance(burner.address);
        user1.balance = await tronWeb.trx.getBalance(user1.address);
        user2.balance = await tronWeb.trx.getBalance(user2.address);
        // console.log("\t::Account Balances::");
        // console.log(`\t  Owner:   ${owner.address} : ${tronWeb.address.toHex(owner.address)} : ${owner.balance} trx`);
        // console.log(`\t  Minter:  ${minter.address} : ${tronWeb.address.toHex(minter.address)} : ${minter.balance} trx`);
        // console.log(`\t  Burner:  ${burner.address} : ${tronWeb.address.toHex(burner.address)} : ${burner.balance} trx`);
        // console.log(`\t  User1:   ${user1.address} : ${tronWeb.address.toHex(user1.address)} : ${user1.balance} trx`);
        // console.log(`\t  User2:   ${user2.address} : ${tronWeb.address.toHex(user2.address)} : ${user2.balance} trx`);
        
        // deploying the DelphiToken contract
        tronWeb.setPrivateKey(PRIVATE_KEYS.owner); // Ensure we're using the owner's key for deployment
        const txnID = await tronWeb.contract().new({
            abi: abi,
            bytecode: bytecode,
            feeLimit: 1000000000, // 1 TRX fee for local only
            callValue: 0,
            parameters: [],
        });
        token =  tronWeb.contract(abi, txnID.address);
        // console.log(`\n\t  DelphiToken Contract deployed at: ${tronWeb.address.fromHex(token.address)}`);
    });

    // ==================================================================
    // 1. Deployment & Standard TRC20 Functions
    // ==================================================================
    describe("1. Deployment & Standard TRC20 Functions", function () {
        it("Should have correct name, symbol, and decimals upon deployment", async function () {
            expect(await token.name().call()).to.equal("Delphi Voting Token v1");
            expect(await token.symbol().call()).to.equal("DELPHI");
            expect(await token.decimals().call()).to.equal(18);
        });

        it("Should have a total supply of 0 on deployment", async function () {
            expect(await token.totalSupply().call()).to.equal(0);
        });

        it("Should allow a standard token transfer", async function () {
            // The Owner calls the PUBLIC `addMember` function to add an address to the Minter role.
            const txnId = await token.addMember(ROLES.Minter, owner.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const txnInfo = await waitForTxInfo(txnId, tronWeb);
            // gettting the memeber of these roles:
            const roleOwner = await token.getMember(ROLES.Owner).call();
            assert(txnInfo.receipt.result == 'SUCCESS', "Failed to add the owner as miner");
            const ownerMinterRole = await token.holdsRole(ROLES.Minter, tronWeb.address.toHex(owner.address)).call();
            expect(ownerMinterRole).to.be.true;
            const txnMint = await token.mint(tronWeb.address.toHex(owner.address), INITIAL_SUPPLY).send({feeLimit: 1000000000,callValue: 0});
            const txnInfo2 = await waitForTxInfo(txnMint, tronWeb);
            assert(txnInfo2.receipt.result == 'SUCCESS', "Failed to mint tokens");
            // now checking the balance of the owner..
            const data = await token.balanceOf(tronWeb.address.toHex(owner.address)).call();
            expect(data).to.equal(INITIAL_SUPPLY);
            // transfering some tokens to user1
            const transferAmount = tronWeb.toSun(10000);
            const txnTransfer = await token.transfer(tronWeb.address.toHex(user1.address), transferAmount).send({
                feeLimit: 1000000000,
                callValue: 0    
            });
            const txnInfo3 = await waitForTxInfo(txnTransfer, tronWeb);
            assert(txnInfo3.receipt.result == 'SUCCESS', "Failed to transfer tokens to user1");
            const user1Balance = await token.balanceOf(tronWeb.address.toHex(user1.address)).call();
            expect(user1Balance).to.equal(transferAmount);
            // balance of owner should be reduced now..
            const ownerBalanceAfter = await token.balanceOf(tronWeb.address.toHex(owner.address)).call();
            expect(ownerBalanceAfter).to.equal(INITIAL_SUPPLY - transferAmount);
        });
    });

    // ==================================================================
    // 2. Role-Based Access Control (MultiRole)
    // ==================================================================
    describe("2. Role-Based Access Control (MultiRole)", function () {
        it("Should set the deployer as the initial Owner", async function () {
            expect(await token.holdsRole(ROLES.Owner, owner.address).call()).to.be.true;
            expect(await token.getMember(ROLES.Owner).call()).to.equal(tronWeb.address.toHex(owner.address));
        });

        it("Should allow the Owner to add and remove members from a Shared role (Minter)", async function () {
            // the Minter is allowed to mint tokens in last test.
            await token.addMember(ROLES.Minter, minter.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            expect(await token.holdsRole(ROLES.Minter, minter.address).call()).to.be.true;
            // Remove Minter
            await token.removeMember(ROLES.Minter, minter.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            expect(await token.holdsRole(ROLES.Minter, minter.address).call()).to.be.false;
        });

        it("Should prevent a non-Owner from managing roles", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.user1); // Switch to user1
            // await expect(
            const txn = await token.addMember(ROLES.Minter, minter.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info = await waitForTxInfo(txn, tronWeb);
            assert(info.result === 'FAILED', "Non-owner was able to add a member");
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
        });

        it("Should allow the Owner to transfer the Owner role", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            await token.resetMember(ROLES.Owner, user1.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            expect(await token.holdsRole(ROLES.Owner, owner.address).call()).to.be.false;
            expect(await token.holdsRole(ROLES.Owner, user1.address).call()).to.be.true;
        });
    });

    // ==================================================================
    // 3. Inflationary & Utility Functions (mint/burn)
    // ==================================================================
    describe("3. Inflationary & Utility Functions (mint/burn)", function () {
        before(async function () {
            // redeploy the contract  with the owner address
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner); // Ensure we're using the owner's key for deployment
            const txnID = await tronWeb.contract().new({
                abi: abi,
                bytecode: bytecode,
                feeLimit: 1000000000, // 1 TRX fee for local only
                callValue: 0,
                parameters: [],
            });
            token =  tronWeb.contract(abi, txnID.address);
            // console.log(`\n\t  DelphiToken Contract re-deployed at: ${tronWeb.address.fromHex(token.address)}`);
        });

        beforeEach(async function () {
            // Grant roles for the tests in this block
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            await token.addMember(ROLES.Minter, minter.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            await token.addMember(ROLES.Burner, burner.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
        });

        it("Should allow a Minter to mint new tokens", async function () {            
            const mintAmount = tronWeb.toSun("5000");
            // call for minting
            tronWeb.setPrivateKey(PRIVATE_KEYS.minter); // setting the minter as the account.
            const mintTxn = await token.mint(user1.address, mintAmount).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const txInfo = await waitForTxInfo(mintTxn, tronWeb);
            assert(txInfo.receipt.result == 'SUCCESS', "Minting transaction failed");
            // creating a promise that run after 5 seconds to check the event emit
            const emitCheckData = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(mintTxn);
                    resolve(data);
                }, 500); // after 0.5 seconds check the status of it.
            });
            assert(emitCheckData.data && emitCheckData.data.length > 0 && emitCheckData.data[0].event_name === 'Transfer', "No events emitted");
            // check balance of the user1
            const user1Balance = await token.balanceOf(user1.address).call();
            expect(user1Balance).to.equal(mintAmount);
            const totalSupply = await token.totalSupply().call();
            expect(totalSupply).to.equal(mintAmount);
        });

        it("Should prevent a non-Minter from minting tokens", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.burner); // setting burner as the account.
            const txnIdd = await token.mint(user1.address, 100).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info = await waitForTxInfo(txnIdd, tronWeb);
            assert(info.result === 'FAILED', "Non-minter was able to mint tokens");
        });

        it("Should allow a Burner to burn their own tokens", async function () {
            const initialAmount = tronWeb.toSun("1000");
            tronWeb.setPrivateKey(PRIVATE_KEYS.minter); // minter as account to send trxn.
            await token.mint(burner.address, initialAmount).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            expect(await token.balanceOf(burner.address).call()).to.equal(initialAmount);
            const burnAmount = tronWeb.toSun("300");
            const total_before_burn = tronWeb.toSun(await token.totalSupply().call());
            tronWeb.setPrivateKey(PRIVATE_KEYS.burner); // burner as account to send trxn.
            const txnIdd = await token.burn(burnAmount).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info = await waitForTxInfo(txnIdd, tronWeb);
            assert(info.receipt.result == 'SUCCESS', "Burning transaction failed");                
            expect(await token.balanceOf(burner.address).call()).to.equal(initialAmount - burnAmount);
        });

        it("Should prevent a non-Burner from burning tokens", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.user1); // user1 as account to send trxn.
            const txnBurnId = await token.burn(100).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info_here = await waitForTxInfo(txnBurnId, tronWeb);
            assert(info_here.result === 'FAILED', "Non-burner was able to burn tokens");
        });
    });

    // ==================================================================
    // 4. Snapshot Functions
    // ==================================================================
    describe("4. Snapshot Functions", function () {
        beforeEach(async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            const txnID = await tronWeb.contract().new({
                abi: abi,
                bytecode: bytecode,
                feeLimit: 1000000000, // 1 TRX fee for local only
                callValue: 0,
                parameters: [],
            });
            token =  tronWeb.contract(abi, txnID.address);
            // console.log(`\n\t  DelphiToken Contract re-deployed at: ${tronWeb.address.fromHex(token.address)}`);
        });

        it("Should create a snapshot and emit a Snapshot event", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner); // Any one can send a snapshot trigger.
            const txnId = await token.snapshot().send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info = await waitForTxInfo(txnId, tronWeb);
            assert(info.receipt.result == 'SUCCESS', "Snapshot transaction failed");
            assert(info.contractResult.length > 0 && parseInt(info.contractResult[0]) == 1, "Snapshot id returned was not 1");
            const emitCheckData = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(txnId);
                    resolve(data);
                }, 500); // after 0.5 seconds check the status of it.
            });
            assert(emitCheckData.data && emitCheckData.data.length > 0 && emitCheckData.data[0].event_name === 'Snapshot', "No Snapshot event emitted");
        });

        it("Should retrieve historical data with balanceOfAt and totalSupplyAt", async function () {
            // Setup initial state
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            await token.addMember(ROLES.Minter, minter.address).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.minter);
            await token.mint(owner.address, tronWeb.toSun("10000")).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            await token.transfer(user1.address, tronWeb.toSun("1000")).send({
                feeLimit: 1000000000,
                callValue: 0
            });

            const supplyBefore = await token.totalSupply().call();
            const balanceBefore = await token.balanceOf(user1.address).call();
            
            // Take snapshot
            // const snapshotId = (await (await token.snapshot()).wait()).events.find(e => e.event === "Snapshot").args.id;
            // expect(snapshotId).to.equal(1);
            const txnId = await token.snapshot().send({
                feeLimit: 1000000000,
                callValue: 0
            });
            const info = await waitForTxInfo(txnId, tronWeb);
            assert(info.receipt.result == 'SUCCESS', "Snapshot transaction failed");
            assert(info.contractResult.length > 0 && parseInt(info.contractResult[0]) == 1, "Snapshot id returned was not 1");
            const snapshotId = 1; // as we are resetting the contract for each test, so this will be always 1.
            
            // Change the state
            tronWeb.setPrivateKey(PRIVATE_KEYS.minter);
            await token.mint(user2.address, tronWeb.toSun("5000")).send({
                feeLimit: 1000000000,
                callValue: 0
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.owner);
            await token.transfer(user1.address, tronWeb.toSun("500")).send({
                feeLimit: 1000000000,
                callValue: 0
            });

            expect(await token.totalSupply().call()).to.not.equal(supplyBefore);
            expect(await token.balanceOf(user1.address).call()).to.not.equal(balanceBefore);

            // Verify historical state using the snapshot ID
            expect(await token.totalSupplyAt(snapshotId).call()).to.equal(supplyBefore);
            expect(await token.balanceOfAt(user1.address, snapshotId).call()).to.equal(balanceBefore);
        });
    });

    // Helper function to wait for transaction confirmation
    async function waitForTxInfo(txId, tronWeb, retries = 20, delay = 3000) {
        for (let i = 0; i < retries; i++) {
            const info = await tronWeb.trx.getTransactionInfo(txId);
            if (info && Object.keys(info).length > 0) {
            return info; // Success
            }
            await new Promise(res => setTimeout(res, delay));
        }
        throw new Error(`Transaction info not found after ${retries} retries`);
    }
    // end of helper function
});
