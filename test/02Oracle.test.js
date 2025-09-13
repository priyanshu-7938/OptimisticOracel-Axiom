const chai = require("chai");
const { expect } = chai;
const { TronWeb } = require("tronweb");
const { abi, bytecode } = require("../artifacts/contracts/DelphiOptimisticOracle.sol/DelphiOptimisticOracle.json");

// Chai custom matchers for TronWeb's BigNumber-like objects can be useful
// const chaiBN = require('chai-bn')(TronWeb.BigNumber);
// chai.use(chaiBN);

let past_Addr;
describe("DelphiOptimisticOracle (TronWeb)", function () {
    let tronWeb;
    let oracle;
    let arbiter, proposer, disputer, otherAccount;

    // --- TronWeb Setup ---
    // NOTE: This test suite assumes you are running a local TRON development node.
    // Replace these private keys with the ones provided by your local node (e.g., Tron Quickstart).
    const PRIVATE_KEYS = {
        other: "3c907a6ae9c8d0ff0c7cf6b95945f0bfdde2d1d2708d8b11c07f6997d300ab7c",
        proposer: "76ef6a4b13f27c4c24e8713af2fa00514db857ea145cbd29fb71034602c3d797",
        arbiter: "5d54020c55baf42485c8b422bc44d8e3781ecbc7ee224b40fef54822626a9876",
        disputer: "9a4a473a5f830d2ccfa66b090bd95bf86c320c2b2d44b4c519669fc5445da44b",
    };

    // --- Constants ---
    // Note: tronWeb.sha3 behaves like ethers.utils.id for simple strings
    const questionId = TronWeb.sha3("Will TRON's daily active addresses exceed 3 million on Dec 1st, 2025?");
    const OUTCOME_NO = 0;
    const OUTCOME_YES = 1;
    const OUTCOME_SPLIT = 2;
    const OUTCOME_EARLY_REQUEST = 3;
    // Note: tronWeb.toSun is equivalent to ethers.utils.parseEther for converting TRX to SUN
    const PROPOSAL_BOND_SUN = TronWeb.toSun("1000"); // 1000 TRX
    const DISPUTE_MULTIPLIER = 2;
    const DISPUTE_BOND_SUN = PROPOSAL_BOND_SUN * DISPUTE_MULTIPLIER;
    const DISPUTE_WINDOW_SECONDS = 21; // 21 seconds for this case setting it to be (testing only)

    before(async function () {
        // Instantiate TronWeb
        tronWeb = new TronWeb(
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090",
            "http://127.0.0.1:9090", // Default for Tron Quickstart
            PRIVATE_KEYS.arbiter // Default private key
        );
        // Set up accounts from private keys
        arbiter = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.arbiter), privateKey: PRIVATE_KEYS.arbiter };
        proposer = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.proposer), privateKey: PRIVATE_KEYS.proposer };
        disputer = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.disputer), privateKey: PRIVATE_KEYS.disputer };
        otherAccount = { address: tronWeb.address.fromPrivateKey(PRIVATE_KEYS.other), privateKey: PRIVATE_KEYS.other };
        // get account balance for each
        arbiter.balance = await tronWeb.trx.getBalance(arbiter.address);
        proposer.balance = await tronWeb.trx.getBalance(proposer.address);
        disputer.balance = await tronWeb.trx.getBalance(disputer.address);
        otherAccount.balance = await tronWeb.trx.getBalance(otherAccount.address);
        console.log("\t::Account Balances::");
        console.log(`\t  Arbiter:  ${arbiter.address} : ${tronWeb.address.toHex(arbiter.address)} : ${arbiter.balance} trx`);
        console.log(`\t  Proposer: ${proposer.address} : ${tronWeb.address.toHex(proposer.address)} : ${proposer.balance} trx`);
        console.log(`\t  Disputer: ${disputer.address} : ${tronWeb.address.toHex(disputer.address)} : ${disputer.balance} trx`);
        console.log(`\t  Other:    ${otherAccount.address} : ${tronWeb.address.toHex(otherAccount.address)} : ${otherAccount.balance} trx`);
        if(past_Addr){
            oracle = tronWeb.contract(abi, past_Addr);
        }else{
            const deployTx = await tronWeb.contract().new({
                abi: abi,
                bytecode: bytecode,
                feeLimit: 1000000000, // 1 TRX fee 
                callValue: 0,
                parameters: [PROPOSAL_BOND_SUN, DISPUTE_MULTIPLIER, DISPUTE_WINDOW_SECONDS],
            });
            oracle = tronWeb.contract(abi, deployTx.address);
            // by default im the arbitor it self.. so no need to do anything.
            console.log(`\n\t  Oracle Contract deployed at: ${tronWeb.address.fromHex(oracle.address)}`);
        }
    });

    describe("Deployment", function () {
        it("Should set the correct constructor parameters", async function () {
            expect(await oracle.arbiter().call()).to.equal(tronWeb.address.toHex(arbiter.address));
            expect((await oracle.proposalBondAmount().call()).toString()).to.equal(PROPOSAL_BOND_SUN.toString());
            expect((await oracle.disputeBondMultiplier().call()).toString()).to.equal(DISPUTE_MULTIPLIER.toString());
            expect((await oracle.disputeWindowSeconds().call()).toString()).to.equal(DISPUTE_WINDOW_SECONDS.toString());
        });
    });

    describe("Happy Path: Propose -> Finalize", function () {
        let proposeTxId;
        let promise_defining_timeout_for_dispute;
        before(async function () {
            tronWeb.setPrivateKey(proposer.privateKey);
            proposeTxId = await oracle.proposeOutcome(questionId, OUTCOME_YES).send({
                callValue: PROPOSAL_BOND_SUN,
            });
            promise_defining_timeout_for_dispute = new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, DISPUTE_WINDOW_SECONDS * 1000 + 3000); // resolving after this proposal confirms.
            });
        });

        it("Should correctly set the state after a proposal", async function () {
            const resolution = await oracle.resolutions(questionId).call();
            expect(resolution.state).to.equal(1); // State.PROPOSED
            expect(resolution.proposer).to.equal(tronWeb.address.toHex(proposer.address));
            expect(resolution.proposedOutcome.toString()).to.equal(OUTCOME_YES.toString());
            expect(resolution.proposalBond.toString()).to.equal(PROPOSAL_BOND_SUN.toString());
        });

        // internal function definition
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
        // ---
        it("Should emit a QuestionProposed event", async function () {
            const txInfo = await waitForTxInfo(proposeTxId, tronWeb);
            const data = await new Promise((resolve,reject)=>{
                setTimeout(async () => {
                    const data = await tronWeb.getEventByTransactionID(proposeTxId);
                    resolve(data);
                }, 5000); // after 5 seconds check the status of it.
            });
            const decodedEvent = (data.data[0].event_name = 'QuestionProposed')? data.data[0] : undefined;
            expect(decodedEvent).to.not.be.undefined;
            expect(decodedEvent.result.questionId).to.equal(questionId.substring(2)); // TronWeb events often omit '0x'
            expect(tronWeb.address.fromHex(decodedEvent.result.proposer)).to.equal(proposer.address);
        });

        it("Should revert if trying to finalize before the dispute window closes", async function () {
            tronWeb.setPrivateKey(otherAccount.privateKey);
             try {
                await oracle.finalizeOutcome(questionId).send({ shouldPollResponse: true });
                expect.fail("Transaction should have reverted but did not.");
            } catch (e) {
                const errorSignature = "DisputeWindowIsOpen()";
                const expectedSelector = tronWeb.sha3(errorSignature).substring(2, 10);
                expect(expectedSelector).to.equal(e.output.contractResult[0]);
            }
        });

        it("Should allow finalization after the dispute window closes", async function () {
            await promise_defining_timeout_for_dispute;
            const finalizeTxId = await oracle.finalizeOutcome(questionId).send();
            const resolution = await oracle.resolutions(questionId).call();
            expect(resolution.state).to.equal(3); // State.RESOLVED
        });

    });

    // NOTE: Further tests for dispute path and edge cases would follow the same TronWeb patterns:
    // 1. Use .send({ from: ..., callValue: ... }) to execute transactions.
    // 2. Use .call() to read state variables.
    // 3. Check for reverts using try/catch blocks.
    // 4. Manually advance time on your local node for time-dependent tests.
    // 5. Decode events from transaction info logs.
});

