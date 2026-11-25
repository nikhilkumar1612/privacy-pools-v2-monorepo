import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * The PRF input ("salt"). The authenticator turns (passkey, salt) into the same
 * 32 bytes every time, so this value must never change for a given key version:
 * a new salt gives new keys. Versioned so a future scheme can use v2.
 */
export const PRF_SALT = sha256(utf8ToBytes("jaw/privacy-pools/prf-salt/v1"));

const RP_NAME = "JAW Privacy Pools PRF POC";

export type CreatedPasskey = {
    credentialId: string;
    /** Whether the authenticator says it supports PRF for this credential. */
    prfEnabled: boolean | undefined;
};

export type PrfResult = {
    credentialId: string;
    /** 32 bytes from the authenticator for (this passkey, PRF_SALT). */
    prfOutput: Uint8Array;
};

/** Creates a discoverable passkey for this origin and asks for PRF support. */
export async function createPasskey(userName: string): Promise<CreatedPasskey> {
    const credential = (await navigator.credentials.create({
        publicKey: {
            rp: { name: RP_NAME, id: location.hostname },
            user: {
                id: crypto.getRandomValues(new Uint8Array(16)),
                name: userName,
                displayName: userName,
            },
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            pubKeyCredParams: [
                { type: "public-key", alg: -7 }, // ES256 (P-256), what JAW passkeys use
                { type: "public-key", alg: -257 }, // RS256, for authenticators without ES256
            ],
            authenticatorSelection: {
                residentKey: "required",
                userVerification: "required",
            },
            extensions: { prf: {} },
        },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error("Passkey creation was cancelled");

    const ext = credential.getClientExtensionResults() as { prf?: { enabled?: boolean } };
    return { credentialId: toBase64Url(credential.rawId), prfEnabled: ext.prf?.enabled };
}

/**
 * Asks the user to pick a passkey for this origin and evaluates PRF with
 * PRF_SALT. No allowCredentials, so a passkey synced from another device works
 * without anything stored locally.
 */
export async function evaluatePrf(): Promise<PrfResult> {
    const assertion = (await navigator.credentials.get({
        publicKey: {
            rpId: location.hostname,
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            userVerification: "required",
            // Copied into a fresh ArrayBuffer-backed array, which the DOM types require.
            extensions: { prf: { eval: { first: new Uint8Array(PRF_SALT) } } },
        },
    })) as PublicKeyCredential | null;
    if (!assertion) throw new Error("Passkey prompt was cancelled");

    const ext = assertion.getClientExtensionResults() as {
        prf?: { results?: { first?: ArrayBuffer } };
    };
    const first = ext.prf?.results?.first;
    if (!first) {
        throw new Error(
            "This passkey or authenticator did not return a PRF result: PRF is not supported here.",
        );
    }
    return { credentialId: toBase64Url(assertion.rawId), prfOutput: new Uint8Array(first) };
}

function toBase64Url(buf: ArrayBuffer): string {
    let s = "";
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
