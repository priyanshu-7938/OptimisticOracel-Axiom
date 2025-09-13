require("dotenv").config();
const{ TronWeb } = require("tronweb");
const artifacts = require("../artifacts/contracts/Greeter.sol/Greeter.json");

const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error("❌ Missing PRIVATE_KEY in .env");
}

const tronWeb = new TronWeb({
  fullHost: "https://nile.trongrid.io", // Nile testnet endpoint
  privateKey,
});

async function main() {
  const { abi, bytecode } = artifacts;

  console.log("🚀 Deploying Greeter to Nile...");

  const contract = await tronWeb.contract().new({
    abi,
    bytecode,
    feeLimit: 100_000_000,
    callValue: 0,
    userFeePercentage: 30,
    parameters: ["Hello Nile!"], // constructor args
  });

  console.log("✅ Deployed at:", tronWeb.address.fromHex(contract.address));
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});

