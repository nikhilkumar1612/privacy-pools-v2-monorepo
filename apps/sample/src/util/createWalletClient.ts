import type { Account, Chain, Transport, WalletClient } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "@privacy-pools-v2/evm-sdk";

import { chain } from "./chain.js";
import { config } from "./config.js";

// Name kept so the existing callers don't change; the chain now comes from CHAIN_ID.
export function createSepoliaWalletClient(
    privateKey: Hex,
): WalletClient<Transport, Chain, Account> {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return createWalletClient({
        account,
        chain,
        transport: http(config.rpcUrl),
    });
}
