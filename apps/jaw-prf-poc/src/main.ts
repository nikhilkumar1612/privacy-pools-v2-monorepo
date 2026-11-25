import { fingerprint, PrfCryptoService, toKeystoreManager } from "./derive.js";
import { createPasskey, evaluatePrf } from "./prf.js";

type Run = {
    at: string;
    credentialId: string;
    nullifying: string;
    revocable0: string;
    revocable1: string;
    viewingPrivate: string;
    viewingPublic: string;
    sdkAccepted: boolean;
};

// Fingerprints only (never keys), so history is safe to keep in localStorage.
const HISTORY_KEY = "jaw-prf-poc/runs";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const cryptoService = new PrfCryptoService();

function loadHistory(): Run[] {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as Run[];
    } catch {
        return [];
    }
}

function saveHistory(runs: Run[]): void {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
    } catch {
        /* private mode or blocked storage: history just isn't kept */
    }
}

function renderHistory(): void {
    const runs = loadHistory();
    if (runs.length === 0) {
        $("out-history").textContent = "No runs yet.";
        return;
    }
    const first = runs[0];
    const lines = runs.map((r, i) => {
        const same =
            r.credentialId !== first.credentialId
                ? "different passkey"
                : r.nullifying === first.nullifying &&
                    r.revocable0 === first.revocable0 &&
                    r.viewingPrivate === first.viewingPrivate
                  ? "SAME keys as run 1"
                  : "DIFFERENT keys from run 1 (same passkey!)";
        return `#${i + 1} ${r.at}  passkey ${r.credentialId.slice(0, 10)}…  nullifying ${r.nullifying}  revocable[0] ${r.revocable0}  viewing ${r.viewingPrivate}  → ${same}`;
    });
    $("out-history").textContent = lines.join("\n");
}

function report(): string {
    return [
        `Environment: ${navigator.userAgent}`,
        `Origin: ${location.origin}`,
        ...loadHistory().map(
            (r, i) =>
                `Run ${i + 1} (${r.at}): passkey ${r.credentialId}, nullifying ${r.nullifying}, revocable[0] ${r.revocable0}, revocable[1] ${r.revocable1}, viewing ${r.viewingPrivate}, viewingPublic ${r.viewingPublic}, SDK accepted: ${r.sdkAccepted}`,
        ),
    ].join("\n");
}

$("btn-create").addEventListener("click", async () => {
    const out = $("out-create");
    out.textContent = "Waiting for the passkey prompt…";
    try {
        const name = `prf-poc-${new Date().toISOString().slice(0, 16)}`;
        const created = await createPasskey(name);
        out.innerHTML =
            `Created passkey "${name}" (id ${created.credentialId.slice(0, 16)}…).\n` +
            `PRF support reported at creation: ` +
            (created.prfEnabled === true
                ? `<span class="ok">yes</span>`
                : created.prfEnabled === false
                  ? `<span class="bad">no</span>`
                  : `unknown (the browser didn't say; step 2 will tell)`);
    } catch (err) {
        out.innerHTML = `<span class="bad">Failed:</span> ${(err as Error).message}`;
    }
});

$("btn-derive").addEventListener("click", async () => {
    const out = $("out-derive");
    out.textContent = "Waiting for the passkey prompt…";
    try {
        const { credentialId, prfOutput } = await evaluatePrf();
        const keys = cryptoService.deriveKeysFromPrf(prfOutput, 0n);
        const rotated = cryptoService.deriveKeysFromPrf(prfOutput, 1n);
        prfOutput.fill(0);

        let sdkAccepted = true;
        let sdkError = "";
        try {
            toKeystoreManager(keys, 0n);
        } catch (err) {
            sdkAccepted = false;
            sdkError = (err as Error).message;
        }

        const run: Run = {
            at: new Date().toISOString().replace("T", " ").slice(0, 19),
            credentialId,
            nullifying: fingerprint(keys.privateNullifyingKey),
            revocable0: fingerprint(keys.privateRevocableKey),
            revocable1: fingerprint(rotated.privateRevocableKey),
            viewingPrivate: fingerprint(keys.viewingPrivateKey),
            viewingPublic: keys.viewingPublicKey,
            sdkAccepted,
        };
        saveHistory([...loadHistory(), run]);

        out.innerHTML = [
            `Passkey: ${credentialId}`,
            `PRF: <span class="ok">supported</span> (32-byte result)`,
            ``,
            `Fingerprints (sha256, first 12 hex chars):`,
            `  nullifying key     ${run.nullifying}`,
            `  revocable key [0]  ${run.revocable0}`,
            `  revocable key [1]  ${run.revocable1}   (rotation: must differ from [0], same nullifying key)`,
            `  viewing key        ${run.viewingPrivate}`,
            `  viewing public key ${run.viewingPublic}   (public, safe to show)`,
            ``,
            sdkAccepted
                ? `SDK KeystoreManager: <span class="ok">accepted the keys</span>`
                : `SDK KeystoreManager: <span class="bad">rejected the keys</span> — ${sdkError}`,
        ].join("\n");
        renderHistory();
    } catch (err) {
        out.innerHTML = `<span class="bad">Failed:</span> ${(err as Error).message}`;
    }
});

$("btn-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(report());
    $("btn-copy").textContent = "Copied";
    setTimeout(() => ($("btn-copy").textContent = "Copy report"), 1500);
});

$("btn-clear").addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
});

renderHistory();
