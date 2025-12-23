/**
 * 🔱 APEX v38.9.25 - THE TRIANGULAR TITAN
 * Strategy: Triangular MEV + Flash Loan Multiplier
 * Target: Obscure "Long-Tail" tokens on Base Mainnet
 */

const { ethers, Wallet, WebSocketProvider } = require('ethers');

const CONFIG = {
    CHAIN_ID: 8453,
    TARGET_CONTRACT: "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    
    // --- TOKENS (The "Triangle" nodes) ---
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    CBETH: "0x2Ae3F1Ec7F1F5563a3d161649c025dac7e983970", // Example 3rd leg (Coinbase ETH)

    WHALE_THRESHOLD: ethers.parseEther("5"), // Lower threshold for long-tail tokens
    MIN_NET_PROFIT: "0.005", // $15+ profit floor
    GAS_LIMIT: 1200000n, // Higher for 3-hop swaps
    WSS_URL: "wss://base-mainnet.g.alchemy.com/v2/G-WBAMA8JxJMjkc-BCeoK"
};

let provider, signer, nextNonce;

async function startTitan() {
    console.log(`\n🔱 TRIANGULAR TITAN: SEARCHING FOR LOOPS...`);
    provider = new WebSocketProvider(CONFIG.WSS_URL);
    signer = new Wallet(process.env.TREASURY_PRIVATE_KEY, provider);

    // Monitor the Uniswap V2/V3 Swap Topic
    const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");

    provider.on({ topics: [swapTopic] }, async (log) => {
        try {
            // 1. FAST FILTER: Only care if the swap involves our triangle tokens
            const isRelated = log.topics.some(topic => 
                topic.toLowerCase().includes(CONFIG.USDC.toLowerCase().slice(2)) || 
                topic.toLowerCase().includes(CONFIG.CBETH.toLowerCase().slice(2))
            );

            if (!isRelated) return;

            // 2. CHOOSE THE PATH (Triangular Logic)
            // Path A: ETH -> USDC -> CBETH -> ETH
            // Path B: ETH -> CBETH -> USDC -> ETH
            const pathA = [CONFIG.WETH, CONFIG.USDC, CONFIG.CBETH, CONFIG.WETH];
            const pathB = [CONFIG.WETH, CONFIG.CBETH, CONFIG.USDC, CONFIG.WETH];

            // 3. MULTIPLIER: Scale the loan based on your wallet success
            const loanAmount = await getDynamicLoan();

            // 4. SIMULATE BOTH DIRECTIONS IN PARALLEL
            const [simA, simB] = await Promise.all([
                simulatePath(pathA, loanAmount),
                simulatePath(pathB, loanAmount)
            ]);

            const bestSim = simA.profit > simB.profit ? simA : simB;

            if (bestSim.profit > calculateTotalCosts(loanAmount)) {
                await executeStrike(bestSim.data);
            }
        } catch (e) {}
    });
}

/**
 * SIMULATE A 3-HOP LOOP (Triangular)
 */
async function simulatePath(path, amount) {
    try {
        const iface = new ethers.Interface(["function executeTriangle(address[],uint256)"]);
        const data = iface.encodeFunctionData("executeTriangle", [path, amount]);
        
        const result = await provider.call({
            to: CONFIG.TARGET_CONTRACT,
            data: data,
            from: signer.address
        });
        
        return { profit: BigInt(result), data };
    } catch (e) {
        return { profit: 0n, data: null };
    }
}

function calculateTotalCosts(loan) {
    const gasCost = CONFIG.GAS_LIMIT * ethers.parseUnits("0.05", "gwei"); // Conservative gas
    const aaveFee = (loan * 9n) / 10000n; // 0.09% Aave Fee
    return gasCost + aaveFee + ethers.parseEther(CONFIG.MIN_NET_PROFIT);
}

// ... (getDynamicLoan and executeStrike logic from previous version)

startTitan().catch(console.error);
