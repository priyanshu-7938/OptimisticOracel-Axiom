const { expect, should, assert } = require("chai");
const { TronWeb } = require("tronweb");
const { abi: tokenAbi, bytecode: tokenBytecode } = require("../artifacts/contracts/DelphiToken.sol/DelphiToken.json");
const { abi: oracleAbi, bytecode: oracleBytecode } = require("../artifacts/contracts/DelphiOptimisticOracle.sol/DelphiOptimisticOracle.json");
const { abi, bytecode } = require("../artifacts/contracts/DisputeResolverDAO.sol/DisputeResolutionDAO.json");


let tronWeb;
// A comprehensive test suite for the DisputeResolutionDAO contract.
describe("DisputeResolutionDAO", function () {
    // Declare variables for contracts and accounts
    let token, oracle, dao;
    let main, user1, user2, user3, user4, oracleOwner, tokenOwner, staker1, staker2, staker3, staker4;
    const ROLES = {
        Owner: 0,
        Minter: 1,
        Burner: 2,
    };

    // Define constants for clarity in tests
    const VOTING_PERIOD_SECONDS = 72 * 60 * 60; // 72 hours fro dao
    // const QUESTION_ID = ethers.utils.id("Test Question?"); // Example questionId
    const QUESTION_ID_1 = TronWeb.sha3("Will TRON's daily active addresses exceed 3 million on Dec 1st, 2025?");
    const QUESTION_ID_2 = TronWeb.sha3("Will TRON's TVL exceed $1 billion by 2025?");

    // Enum from the mock oracle for easy access
    const OUTCOMES = {
        NO: 0,
        YES: 1,
        SPLIT: 2,
        EARLY_REQUEST: 3,
    };
    const PRIVATE_KEYS = {
        main: "dd4c868e9f7eea14eaa73c599593edbd1589f631c187ce9115b214789e2c21a9",
        //question desputer and propser 
        user1: "69bc19ab0c62c87c063cdc5abcfe37d8e2108bfae7542f13d8f5308de1607aa9",
        user2: "c38e18a9598bf6366b6a06ee2757e0a55d270f05486c820b58f35602ceb422f9",
        user3: "61196fa406b4fb07a90fc84ac4901bb6a9194c4827f1aed8d10cfe50fbb53726",
        user4: "db62eaaf5ce18451c55c3919fca0d95ca005028258131243d557c43219d932bf",
        //oracle related acc.
        oracleOwner: "3fe0a2501f6f9810bed8433315be439bc013763218a7257625b531407a4a53e0",
        //token related acc.
        tokenOwner: "064515bebbbb8d3050dca36313d9a3d8b9a1098ba2f5cf883d8bfa56008c8949",
        // stakers for testing (also for token holders)
        staker1: "967bae422f12e75a3b5a7117b34022a259a7fc88fd3e7bb5a9e544a26470ddbd",
        staker2: "82203c0c9ecb2afcea3d21119f35258d3a3c69bd8c1407d2bc428150b12a8b46",
        staker3: "757a4856cee7584ce7e7f9dba5c9d07ff624e89909308e48c1e245f018b50b7a",
        staker4: "c139ea1165b875e725a40868fe295203edad7ff6fc86ec195dcc2120cee213ad",
    };

    const PROPOSAL_BOND_SUN = TronWeb.toSun("100"); // 100 TRX
    const DISPUTE_MULTIPLIER = 2;
    const DISPUTE_BOND_SUN = PROPOSAL_BOND_SUN * DISPUTE_MULTIPLIER;
    const DISPUTE_WINDOW_SECONDS = 10; // 10 seconds for this case setting it to be (testing only)

    // Before each test, deploy fresh contract instances to ensure a clean state
    before(async function () {
        tronWeb = new TronWeb(
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090", // Default for Tron Quickstart
            PRIVATE_KEYS.main // Default private key
        );
        // Set up accounts from private keys
        main = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.main), privateKey: PRIVATE_KEYS.main };
        user1 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user1), privateKey: PRIVATE_KEYS.user1 };
        user2 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user2), privateKey: PRIVATE_KEYS.user2 };
        user3 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user3), privateKey: PRIVATE_KEYS.user3 };
        user4 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.user4), privateKey: PRIVATE_KEYS.user4 };
        oracleOwner = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.oracleOwner), privateKey: PRIVATE_KEYS.oracleOwner };
        tokenOwner = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.tokenOwner), privateKey: PRIVATE_KEYS.tokenOwner };
        staker1 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.staker1), privateKey: PRIVATE_KEYS.staker1 };
        staker2 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.staker2), privateKey: PRIVATE_KEYS.staker2 };
        staker3 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.staker3), privateKey: PRIVATE_KEYS.staker3 };
        staker4 = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.staker4), privateKey: PRIVATE_KEYS.staker4 };
        // get account balance for each
        main.balance = await tronWeb.trx.getBalance(main.address);
        user1.balance = await tronWeb.trx.getBalance(user1.address);
        user2.balance = await tronWeb.trx.getBalance(user2.address);
        user3.balance = await tronWeb.trx.getBalance(user3.address);
        user4.balance = await tronWeb.trx.getBalance(user4.address);
        oracleOwner.balance = await tronWeb.trx.getBalance(oracleOwner.address);
        tokenOwner.balance = await tronWeb.trx.getBalance(tokenOwner.address);
        staker1.balance = await tronWeb.trx.getBalance(staker1.address);
        staker2.balance = await tronWeb.trx.getBalance(staker2.address);
        staker3.balance = await tronWeb.trx.getBalance(staker3.address);
        staker4.balance = await tronWeb.trx.getBalance(staker4.address);

        // console.log("\t::Account Balances::");
        // console.log(`\t  Main:     ${main.address} : ${tronWeb.address.toHex(main.address)} : ${main.balance} trx`);
        // console.log(`\t  User1:    ${user1.address} : ${tronWeb.address.toHex(user1.address)} : ${user1.balance} trx`);
        // console.log(`\t  User2:    ${user2.address} : ${tronWeb.address.toHex(user2.address)} : ${user2.balance} trx`);
        // console.log(`\t  User3:    ${user3.address} : ${tronWeb.address.toHex(user3.address)} : ${user3.balance} trx`);
        // console.log(`\t  User4:    ${user4.address} : ${tronWeb.address.toHex(user4.address)} : ${user4.balance} trx`);
        // console.log(`\t  OracleOwner: ${oracleOwner.address} : ${tronWeb.address.toHex(oracleOwner.address)} : ${oracleOwner.balance} trx`);
        // console.log(`\t  TokenOwner:  ${tokenOwner.address} : ${tronWeb.address.toHex(tokenOwner.address)} : ${tokenOwner.balance} trx`);
        // console.log(`\t  Staker1:  ${staker1.address} : ${tronWeb.address.toHex(staker1.address)} : ${staker1.balance} trx`);
        // console.log(`\t  Staker2:  ${staker2.address} : ${tronWeb.address.toHex(staker2.address)} : ${staker2.balance} trx`);
        // console.log(`\t  Staker3:  ${staker3.address} : ${tronWeb.address.toHex(staker3.address)} : ${staker3.balance} trx`);
        // console.log(`\t  Staker4:  ${staker4.address} : ${tronWeb.address.toHex(staker4.address)} : ${staker4.balance} trx`);

        
        // 1. Deploy a mock DelphiToken
        tronWeb.setPrivateKey(PRIVATE_KEYS.tokenOwner);
        token = await deployMockToken();
        // 2. Deploy a mock Optimistic Oracle
        tronWeb.setPrivateKey(PRIVATE_KEYS.oracleOwner);
        oracle = await deployMockOracle(PROPOSAL_BOND_SUN, DISPUTE_MULTIPLIER, DISPUTE_WINDOW_SECONDS); // pass in values.. here...
        // 3. Deploy the DAO first
        tronWeb.setPrivateKey(PRIVATE_KEYS.main);
        dao = await deployMockDAO(token, oracle);
        // then cal the setArbitor on the oracle contract to set the dao as the arbitor.
        tronWeb.setPrivateKey(PRIVATE_KEYS.oracleOwner);
        const data = await oracle.setArbiter(dao.address).send({
            feeLimit: 1000000000,
            callValue: 0,
            shouldPollResponse: true,
        });

        // 4. Distribute tokens to stakers for testing
        // The owner of the token (deployer) first adds themselves as a Minter
        // its like selling the tokens to the world initially or doing air drops...
        tronWeb.setPrivateKey(PRIVATE_KEYS.tokenOwner); // air dropping the people....
        await token.addMember(ROLES.Minter, tokenOwner.address).send({
            feeLimit: 1000000000,
            callValue: 0,
            shouldPollResponse: true, // only polls till the txn gets confermed....
        });
        // Mint tokens to the stakers
        await token.mint(staker1.address, tronWeb.toSun("1000")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
        await token.mint(staker2.address, tronWeb.toSun("2000")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
        await token.mint(staker3.address, tronWeb.toSun("500")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
        await token.mint(staker4.address, tronWeb.toSun("300")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });

        // printing token balances here
        console.log("\t::Token Balances::");
        console.log(`\t  Staker1: ${tronWeb.fromSun(await token.balanceOf(staker1.address).call())} DLT`);
        console.log(`\t  Staker2: ${tronWeb.fromSun(await token.balanceOf(staker2.address).call())} DLT`);
        console.log(`\t  Staker3: ${tronWeb.fromSun(await token.balanceOf(staker3.address).call())} DLT`);
        console.log(`\t  Staker4: ${tronWeb.fromSun(await token.balanceOf(staker4.address).call())} DLT`);

        // await token.connect(owner).addMember(ROLES.Minter, dao.address);// 
    });


    // ==================================================================
    // 1. Deployment and Initialization
    // ==================================================================
    describe("1. Deployment and Initialization", function () {
        it("Should correctly set the token and oracle addresses upon deployment", async function () {
            expect(await dao.delphiToken().call()).to.equal(token.address);
            expect(await dao.oracle().call()).to.equal(oracle.address);
        });
    });


    // ==================================================================
    // 2. Staking and Unstaking Logic
    // ==================================================================
    describe("2. Staking and Unstaking", function () {
        beforeEach(async function () {
            // Staker1 must approve the DAO contract to spend their tokens before staking
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            expect(await token.approve(dao.address, tronWeb.toSun("1000")).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            })).to.be.true;
        });

        it("Should allow a user to stake tokens successfully", async function () {
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            const stakeAmount = tronWeb.toSun("500");
            const txnId = await dao.stake(stakeAmount).send({
                feeLimit: 1000000000,
                callValue: 0,
            });
            const data = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(txnId);
                    resolve(data);
                }, 1000); // after 1 second check the status of it.
            });
            const decodedEventArr = (data.data.filter(event => event.event_name == 'Staked'));
            expect(decodedEventArr.length > 0).to.be.true;
            expect(await dao.stakedBalances(staker1.address).call()).to.equal(stakeAmount);
            expect(await token.balanceOf(dao.address).call()).to.equal(stakeAmount);
        });

        it("Should prevent staking if the user has not approved the contract", async function () {
            // Staker2 has not approved the DAO
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker2);
            try {
                await dao.stake(tronWeb.toSun("100")).send({
                    feeLimit: 1000000000,
                    callValue: 0,
                    shouldPollResponse: true,
                });
                expect.fail("Transaction should have reverted but did not.");
            } catch (e) {
                expect(e.output.internal_transactions[0].rejected).to.be.true;
            }
        });
    
        it("Should allow a user to unstake their tokens", async function () {
            const stakeAmount = tronWeb.toSun("500");
            const allreadyAmountStaked = await dao.stakedBalances(staker1.address).call();
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            await dao.stake(stakeAmount).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            const unstakeAmount = tronWeb.toSun("200");
            await dao.unstake(unstakeAmount).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            });
            // Verify balances are updated correctly
            const expectedRemainingStake = stakeAmount - unstakeAmount + parseInt(allreadyAmountStaked);
            expect(await dao.stakedBalances(staker1.address).call()).to.equal(expectedRemainingStake);
            expect(await token.balanceOf(dao.address).call()).to.equal(expectedRemainingStake);
        });

        it("Should prevent unstaking more tokens than the user has staked", async function () {
            const stakedBalances = await dao.stakedBalances(staker1.address).call();
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            try{
                const txn = await dao.unstake(tronWeb.toSun(100 + parseInt(tronWeb.fromSun(stakedBalances)))).send({
                    feeLimit: 1000000000,
                    callValue: 0,
                    shouldPollResponse: true,
                });
            } catch(e){
                expect(e.output.receipt.result).to.equal("REVERT");
            }
        });
    });


    // ==================================================================
    // 3. Core Dispute and Voting Lifecycle
    // ==================================================================
    describe("3. Dispute Lifecycle", function () {
        before(async function () {
            // All stakers approve and stake their full balances for these tests
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            await token.approve(dao.address, tronWeb.toSun("200")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            await dao.stake(tronWeb.toSun("200")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker2);
            await token.approve(dao.address, tronWeb.toSun("1100")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            await dao.stake(tronWeb.toSun("1100")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker3);
            await token.approve(dao.address, tronWeb.toSun("300")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            await dao.stake(tronWeb.toSun("300")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker3);
            await token.approve(dao.address, tronWeb.toSun("100")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            await dao.stake(tronWeb.toSun("100")).send({ feeLimit: 1000000000, callValue: 0, shouldPollResponse: true });
            // console.log(await dao.stakedBalances(staker1.address).call()); // return 1000 (800 from above + 200)
            // console.log(await dao.stakedBalances(staker2.address).call()); // return 1100
            // console.log(await dao.stakedBalances(staker3.address).call()); // return 300
            // console.log(await dao.stakedBalances(staker4.address).call()); // return 100

            // lets first create an problem submission on the oracle for the question id QUESTION_ID_1
            tronWeb.setPrivateKey(PRIVATE_KEYS.user1); // question proposer
            await oracle.proposeOutcome( QUESTION_ID_1, OUTCOMES.NO).send({ // 0 -> OPTION_NO
                feeLimit: 1000000000,
                callValue: PROPOSAL_BOND_SUN, // attached propoal value
                shouldPollResponse: true,
            });
        });
        let tempPromise; // promise used to callback after voting period is completed
        it("Should only allow the whitelisted Oracle to create a dispute", async function () {
            // Attempt from a random user should fail

            try{
                tronWeb.setPrivateKey(PRIVATE_KEYS.user2); // random user who is not an oracle
                await dao.createDispute(QUESTION_ID_1).send({
                    feeLimit: 1000000000,
                    callValue: 0,
                    shouldPollResponse: true,
                });
                expect.fail("Transaction should have reverted but did not.");
            }catch(e){
                expect(e.message).to.include("REVERT");
            }
            // creating a despute form the oracle to envoke function in DAO
            // calling this txn before the despute time run out.
            tronWeb.setPrivateKey(PRIVATE_KEYS.user2); // desputer
            const txn = await oracle.disputeOutcome(QUESTION_ID_1).send({
                feeLimit: 1000000000,
                callValue: DISPUTE_BOND_SUN, // attached dispute value
                shouldPollResponse: true,
            });
            // make a timeout promise that will say when to call the despute vote calculation part... 20 seconds later....
            tempPromise = new Promise((resolve) => {
                setTimeout(() => resolve(true), 21000); // wait for 21 seconds
            });
            // checking in the dao weather a despute was triggered...
            const res = await dao.disputes(QUESTION_ID_1).call();
            assert(res.exists, "Dispute should be active after being created by the oracle.");
        });

        it("Should allow stakers to vote on an active dispute", async function () {
            // Staker1 votes YES
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
            await dao.vote(QUESTION_ID_1, OUTCOMES.YES).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker2);
            await dao.vote(QUESTION_ID_1, OUTCOMES.NO).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            });
            tronWeb.setPrivateKey(PRIVATE_KEYS.staker3);
            await dao.vote(QUESTION_ID_1, OUTCOMES.YES).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true,
            });
           
        });

        it("Should prevent a user from voting twice", async function () {
            // avoide multi-voting.
            try{
                // try to vote again with staker1
                tronWeb.setPrivateKey(PRIVATE_KEYS.staker1);
                await dao.vote(QUESTION_ID_1, OUTCOMES.YES).send({
                    feeLimit: 1000000000,
                    callValue: 0,
                    shouldPollResponse: true,
                });
                expect.fail("Transaction should have reverted but did not. vote twice");
            }catch(e){
                expect(e.message).to.include("REVERT");
            }  
        });

        it("Should prevent voting after the deadline", async function () {
            await tempPromise; // wait for the voting period to end
            // try to vote after vote period
            try{
                tronWeb.setPrivateKey(PRIVATE_KEYS.staker4);
                await dao.vote(QUESTION_ID_1, OUTCOMES.NO).send({
                    feeLimit: 1000000000,
                    callValue: 0,
                    shouldPollResponse: true,
                });
                expect.fail("Transaction should have reverted but did not. vote after vote period");
            }
            catch(e){
                expect(e.message).to.include("REVERT");
            }
        });

        it("Should correctly tally votes and resolve the dispute on the oracle", async function () {
             // technically: staker1 (1000) + staker3 (300) = 1300 votes for YES, staker2 (1100) votes for NO
            tronWeb.setPrivateKey(PRIVATE_KEYS.user3); // random user who has encentive in this poll.
            const txnID = await dao.tallyAndResolve(QUESTION_ID_1).send({
                feeLimit: 1000000000,
                callValue: 0,
            });
            const data = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(txnID);
                    resolve(data);
                }, 1000); // after 1 second check the status of it.
            });
            const filterarr = data.data.filter(event => event.event_name == 'DisputeResolved');
            expect( filterarr.length > 0 ).to.be.true;
            // now computing the expected winner
            const expectedWinner = OUTCOMES.YES; // staker1 and staker3 have the most stake voting for YES
            expect(parseInt(filterarr[0].result.winningOutcome)).to.equal(expectedWinner);
            // check in the oracle if the outcome was updated
            const finalOutcome = await oracle.getOutcome(QUESTION_ID_1).call();
            expect(parseInt(finalOutcome)).to.equal(expectedWinner);
        });
        
        it("Should handle a tie by defaulting to the NO outcome", async function () {
            // Have two users with equal stake vote for different outcomes
            //deploy a second question : QUESTION_ID_2
            tronWeb.setPrivateKey(PRIVATE_KEYS.user3); // question proposer
            await oracle.proposeOutcome( QUESTION_ID_2, OUTCOMES.YES).send({ // 1 -> OPTION_YES
                feeLimit: 1000000000,
                callValue: PROPOSAL_BOND_SUN, // attached propoal value
                shouldPollResponse: true,
            });
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, (DISPUTE_WINDOW_SECONDS + 2) * 1000); // wait for 12 seconds
            });

            await timeoutPromise; // wait for the dispute window to pass
            // creating a despute form the oracle to envoke function in DAO
            // check the status of the question...
            
            const txn = await oracle.finalizeOutcome(QUESTION_ID_2).send({
                feeLimit: 1000000000,
                callValue: 0, // attached dispute value
            });
            // now check the status and emit event of this one.
            const txnData = await waitForTxInfo(txn, tronWeb);
            // now creating a dispute on this one.
            const data = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(txn);
                    resolve(data);
                }, 1000);
            });
            const filterarr = data.data.filter(event => event.event_name == 'QuestionResolved');
            expect( filterarr.length > 0 ).to.be.true;
            expect(filterarr[0].result.finalOutcome).to.equal(OUTCOMES.YES.toString());
        });
    });
});


// ==================================================================
// Mock Contracts for Testing
// ==================================================================

// We define factory functions to easily deploy our mocks with ethers
const deployMockToken = async () => {
    const txnID = await tronWeb.contract().new({
            abi: tokenAbi,
            bytecode: tokenBytecode,
            feeLimit: 1000000000, // 1 TRX fee for local only
            callValue: 0,
            parameters: [],
        });
    const _token =  tronWeb.contract(tokenAbi, txnID.address);
    return _token;
};

const deployMockOracle = async (proposalBond, disputeMultiplier, disputeWindow) => {
    const txnID = await tronWeb.contract().new({
            abi: oracleAbi,
            bytecode: oracleBytecode,
            feeLimit: 1000000000, // 1 TRX fee for local only
            callValue: 0,
            parameters: [proposalBond, disputeMultiplier, disputeWindow],
        });
    const _oracle =  tronWeb.contract(oracleAbi, txnID.address);
    return _oracle;
};

const deployMockDAO = async (token, oracle) => {
    if(!token || !oracle) throw new Error("Token and Oracle must be deployed first");
    const txnID = await tronWeb.contract().new({
            abi: abi,
            bytecode: bytecode,
            feeLimit: 1000000000, // 1 TRX fee for local only
            callValue: 0,
            parameters: [token.address, oracle.address],
        });
    const _dao =  tronWeb.contract(abi, txnID.address);
    return _dao;
};

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