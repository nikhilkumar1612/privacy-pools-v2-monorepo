import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { APP_IDENTIFIER, CryptoService, KeystoreManager } from "@privacy-pools-v2/evm-sdk";
import type { Hex } from "@privacy-pools-v2/evm-sdk";

/** Stage 1 for passkeys: replaces the SDK's signature-based root secret. */
const PRF_ROOT_SALT = "JAW-PRF";
const PRF_ROOT_INFO = "JAW-PRF-Secret-Derivation-v1-Root";

export type ProtocolKeys = {
    privateNullifyingKey: Hex;
    privateRevocableKey: Hex;
    viewingPrivateKey: Hex;
    viewingPublicKey: Hex;
};

/**
 * The SDK's CryptoService, with one extra entry point: keys from a passkey PRF
 * output instead of a wallet signature.
 *
 * The SDK derives keys in two stages:
 *   1. rootSecret = HKDF(wallet signature)        (CryptoService.deriveRootSecret)
 *   2. appSecret  = HKDF(rootSecret, APP_IDENTIFIER), then the nullifying,
 *      revocable[n] and viewing keys              (deriveAppSecret, deriveKeys)
 * Only stage 1 changes here; stage 2 is the SDK's own code, so the keys get the
 * same BN254 field reduction, revocable-key rotation and viewing-key format.
 */
export class PrfCryptoService extends CryptoService {
    deriveKeysFromPrf(prfOutput: Uint8Array, revocableKeyIndex = 0n): ProtocolKeys {
        if (prfOutput.length !== 32) {
            throw new Error(`PRF output must be 32 bytes, got ${prfOutput.length}`);
        }
        const rootSecret = hkdf(
            sha256,
            prfOutput,
            utf8ToBytes(PRF_ROOT_SALT),
            utf8ToBytes(PRF_ROOT_INFO),
            32,
        );
        const appSecret = this.deriveAppSecret(rootSecret, utf8ToBytes(APP_IDENTIFIER));
        try {
            return this.deriveKeys(appSecret, revocableKeyIndex) as ProtocolKeys;
        } finally {
            rootSecret.fill(0);
            appSecret.fill(0);
        }
    }
}

/**
 * Builds the SDK's KeystoreManager from the derived keys. Its constructor
 * validates them (32-byte secrets, viewing public key matching the private key),
 * so this throwing means the SDK would not accept the keys.
 */
export function toKeystoreManager(keys: ProtocolKeys, revocableKeyIndex = 0n): KeystoreManager {
    return new KeystoreManager({
        ...keys,
        revocableKeyIndex: `0x${revocableKeyIndex.toString(16)}` as Hex,
    });
}

/** Short, non-reversible label for a secret, safe to show and compare across devices. */
export function fingerprint(secret: Hex): string {
    const bytes = utf8ToBytes(secret.toLowerCase());
    return bytesToHex(sha256(bytes)).slice(0, 12);
}
