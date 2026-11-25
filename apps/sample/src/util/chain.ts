import type { Chain } from "viem";
import { bsc, sepolia } from "viem/chains";

import { config } from "./config.js";

// The viem chain for CHAIN_ID, so the sample runs on Sepolia or BNB Chain.
const CHAINS: Record<number, Chain> = {
    [sepolia.id]: sepolia,
    [bsc.id]: bsc,
};

function chainFor(chainId: number): Chain {
    const found = CHAINS[chainId];
    if (!found) {
        throw new Error(`CHAIN_ID ${chainId} is not supported by this sample (use 11155111 or 56)`);
    }
    return found;
}

export const chain: Chain = chainFor(config.chainId);
