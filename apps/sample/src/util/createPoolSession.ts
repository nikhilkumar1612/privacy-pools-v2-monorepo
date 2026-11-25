import { join } from "node:path";
import type {
    Hex,
    ICryptoService,
    IHashService,
    PersistentStorageConfig,
    PoolSession,
} from "@privacy-pools-v2/evm-sdk";
import type { Account, Chain, Transport, WalletClient } from "viem";
import {
    createEvmPoolVaultInteractor,
    CryptoService,
    PinoLogger,
    PoolSessionBuilder,
    PoolVaultInteractor,
    PoseidonHashService,
    ViemRPCInteractor,
} from "@privacy-pools-v2/evm-sdk";
import { numberToHex } from "viem";

import { chain } from "./chain.js";
import { config } from "./config.js";

// Mirrors evm-sdk's SUPPORTED_CHAIN_IDS (constant/RPCInteractor.ts: Sepolia,
// Arbitrum, Base), which its type definitions list but its built module does
// not export at runtime.
const RPC_INTERACTOR_CHAIN_IDS: ReadonlySet<number> = new Set([11155111, 42161, 8453]);

export type ProtocolKeys = {
    privateNullifyingKey: Hex;
    privateRevocableKey: Hex;
    viewingPrivateKey: Hex;
    viewingPublicKey: Hex;
    /** Rotation index `n` of the supplied `privateRevocableKey` as 0x-prefixed hex. Defaults to `"0x0"` for fresh accounts. */
    revocableKeyIndex?: Hex;
};

export type CreatePoolSessionParams = {
    ownerAddress: Hex;
    protocolKeys: ProtocolKeys;
    walletClient?: WalletClient<Transport, Chain, Account>;
    /**
     * Optional persistent-storage selector forwarded to `PoolSessionBuilder`.
     * When provided, the SDK auto-persists NoteManager + PaymentRequestService
     * state to the chosen backend (file / localStorage / memory).
     */
    persistentStorage?: PersistentStorageConfig;
};

export type CreatePoolSessionResult = {
    poolSession: PoolSession;
    rpcInteractor: ViemRPCInteractor;
    hashService: IHashService;
    cryptoService: ICryptoService;
    poolVaultInteractor: PoolVaultInteractor;
};

const CIRCUIT_ARTIFACTS_DIR = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "packages",
    "circuits",
    "build",
);

export async function createPoolSession(
    params: CreatePoolSessionParams,
): Promise<CreatePoolSessionResult> {
    // Operators can flip to "debug" to surface getLogsPaginated chunk
    // progress, rate-limit retries, and ASP/relayer HTTP details.
    // LOG_LEVEL=debug on the command line shows log-scan chunks and HTTP calls.
    const logger = PinoLogger.create({
        level: (process.env["LOG_LEVEL"] ?? "info") as "info",
    });

    // The SDK's RPC interactor only accepts a `chain` in SUPPORTED_CHAIN_IDS
    // (Sepolia, Arbitrum, Base), though 0xbow runs BNB Chain in production.
    // `chain` is optional for these reads, so it is left out elsewhere; the
    // wallet client that signs still uses the real chain.
    const rpcInteractor = ViemRPCInteractor.create(
        {
            rpcUrl: config.rpcUrl,
            ...(RPC_INTERACTOR_CHAIN_IDS.has(chain.id) ? { chain } : {}),
        },
        { logger },
    );
    const hashService = await PoseidonHashService.create();
    const cryptoService = new CryptoService();
    // The SDK moved PoolVaultInteractor onto a chain adapter; the EVM factory
    // takes the old config shape. Only the checks use this one (to read the
    // pool); the session builds its own from `deployment` below.
    const poolVaultInteractor = createEvmPoolVaultInteractor(
        {
            rpcInteractor,
            contractAddress: config.poolAddress,
            deploymentBlock: config.deploymentBlock,
        },
        { logger },
    );

    const poolSession = await PoolSessionBuilder.fromConfig({
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        // The SDK's built-in address table only covers Sepolia, so the
        // addresses come from .env for any chain.
        deployment: {
            poolAddress: config.poolAddress,
            entrypointAddress: config.entrypointAddress,
            keystoreAddress: config.keystoreAddress,
            aspRegistryAddress: config.aspRegistryAddress,
            relaySwapsAddress: config.relaySwapsAddress,
        },
        deploymentBlock: numberToHex(config.deploymentBlock),
        ownerAddress: params.ownerAddress,
        protocolKeys: {
            ...params.protocolKeys,
            revocableKeyIndex: params.protocolKeys.revocableKeyIndex ?? ("0x0" as Hex),
        },
        aspUrl: config.aspUrl,
        relayers: [
            {
                name: "0xBow Relayer",
                url: config.relayerUrl,
                address: config.relayerAddress,
                processorAddress: config.relayerProcessorAddress,
                chainId: chain.id,
                chainType: "evm",
                status: "active",
            },
        ],
        circuitArtifactsDir: CIRCUIT_ARTIFACTS_DIR,
        logger,
        walletInteractor: params.walletClient
            ? { type: "viem", walletClient: params.walletClient }
            : undefined,
        persistentStorage: params.persistentStorage,
    })
        .withRpcInteractor(rpcInteractor)
        .withHashService(hashService)
        .withCryptoService(cryptoService)
        // No .withVaultInteractor(): the SDK rejects it together with `deployment`.
        .create();

    return {
        poolSession,
        rpcInteractor,
        hashService,
        cryptoService,
        poolVaultInteractor,
    };
}
