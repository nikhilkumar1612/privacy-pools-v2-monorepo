import type {
    Hash,
    Hex,
    PoolSession,
    PrepareRageQuitResult,
    ViemRPCInteractor,
} from "@privacy-pools-v2/evm-sdk";
import type { Account, Chain, Transport, WalletClient } from "viem";

/**
 * Ragequit — emergency exit, bypasses ASP and relayer.
 *
 * The note's owner submits a proof against the original deposit lineage.
 * The contract forwards the full note value to the original deposit
 * recipient address (enforced by the circuit — you cannot redirect funds
 * elsewhere). No relayer, no ASP gating, no fee.
 *
 * Wallet client requirement: REQUIRED — caller submits the tx themselves.
 * Ragequit deliberately has no relayed path; if you can't sign the tx,
 * you can't ragequit.
 *
 * @param session            PoolSession.
 * @param walletClient       Viem wallet client for the note owner.
 * @param rpcInteractor      RPC interactor (used to await the receipt).
 * @param commitment         Commitment hash of the note to exit.
 * @returns                  `{ prepared, txHash }` — `prepared.nullifierHash`
 *                           is what to look up on-chain to confirm the spend.
 */
export async function ragequit(
    session: PoolSession,
    walletClient: WalletClient<Transport, Chain, Account>,
    rpcInteractor: ViemRPCInteractor,
    commitment: Hash,
): Promise<{
    prepared: PrepareRageQuitResult;
    receipt: { txHash: Hex; blockNumber: Hex; status: boolean };
}> {
    const prepared = await session.prepareRageQuit({ commitment });
    // The SDK now returns the transaction as `ragequitTx` ({ to, data, value }).
    const txHash = await walletClient.sendTransaction({
        to: prepared.ragequitTx.to as `0x${string}`,
        data: prepared.ragequitTx.data as `0x${string}`,
        value: BigInt(prepared.ragequitTx.value),
    });
    const receipt = await rpcInteractor.waitForTransactionReceipt(txHash as Hex);
    return {
        prepared,
        receipt: {
            txHash: txHash as Hex,
            blockNumber: receipt.blockNumber,
            status: receipt.status,
        },
    };
}
