# Project Delphi: A Decentralized Prediction Market

**Project Delphi** is a high-performance decentralized finance (DeFi) platform built on the **TRON network**, designed to enable prediction markets. It leverages a custom **Optimistic Oracle** and a unique **tokenomics model** to ensure security, performance, and strong user engagement.

---

## 🚩 The Problem It Solves

Traditional prediction markets often struggle with:

- **Centralization risks** – vulnerability to manipulation and censorship.  
- **Security concerns** – reliance on centralized oracles or single points of failure.  
- **Performance bottlenecks** – on-chain order books can be slow and expensive.  

**Project Delphi** addresses these issues by combining **off-chain order matching** for speed with **on-chain settlement** for transparency and security, all powered by TRON’s high throughput blockchain.

---

## 🛠 What It Needed

1. **Decentralized & Secure Oracle**  
   - Traditional oracles are centralized.  
   - Delphi required a **robust oracle system** to resolve events securely and transparently.  
   - Solution: A **custom Optimistic Oracle** where outcomes can be proposed and challenged by stakers.  

2. **High-Performance Trading**  
   - Pure on-chain order books are costly and slow.  
   - Needed a solution for **fast, high-volume order execution**.  

3. **Efficient On-Chain Settlement**  
   - Matching orders off-chain is fast.  
   - Final settlement needed to remain **secure and transparent** on-chain.  

---

## ⚙️ How It Works

- **Off-Chain Central Limit Order Book (CLOB)**  
  Handles high-frequency matching of buy and sell orders.  
  → Provides near-instant trades and an exchange-like experience.  

- **On-Chain Settlement**  
  Asset transfers and settlements are finalized on the TRON blockchain.  
  → Smart contracts written in **Solidity** ensure security and fund integrity.  

- **Optimistic Oracle**  
  Works on a **“guilty until proven innocent”** basis:  
  - Outcomes are proposed by a party.  
  - Stakers can challenge within a set time window.  
  - Reduces constant on-chain validation, lowering latency and costs.  

---

## 💠 Tokenomics & Voting Mechanism

Delphi uses an **inflationary token** at the core of governance and oracle security:

- **Correct Voters**  
  - Stakers who vote correctly on event outcomes are **rewarded**.  
  - Rewards come from newly minted tokens, aligning incentives with accuracy.  

- **Wrong Voters**  
  - Stakers voting against the final outcome are **penalized**.  
  - Their stake is slashed or redistributed to correct voters.  

This creates a **self-regulating economic system**, ensuring that integrity and honest participation are financially incentivized.

---

## 🧪 Testing the Smart Contracts

To test Delphi’s smart contracts, set up a local TRON node and use Hardhat.

### 1. Run a Local TRON Node (via Docker)

```bash
docker run -p 9090:9090 \
  -e "accounts=22" \
  -e "mnemonic=coconut pause space sheriff hero vocal carpet lawsuit notable nose build radar" \
  -p 50051:50051 \
  -p 50052:50052 \
  --name tron tronbox/tre:dev

```

### 2. Compile and Test with Hardhat

Once the TRON node is running, compile and test the contracts:
```bash
npx hardhat compile
npx hardhat test

```

- This will test all smart contracts, including:
  - Delphi Token Contract
  - Optimistic Oracle Contract
  - Voting Mechanism Contract