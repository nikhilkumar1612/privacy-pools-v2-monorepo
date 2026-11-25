import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Same setup as apps/sample-web: the SDK is used from source, and the Node
// built-ins it imports are stubbed for the browser.
const root = resolve(__dirname, "../..");

function nodeStubs(): Plugin {
    const STUBS = new Set([
        "fs", "fs/promises", "node:fs", "node:fs/promises",
        "path", "node:path",
        "assert", "node:assert",
        "events", "node:events",
        "stream", "util", "os",
    ]);
    const PREFIX = "\0node-stub:";

    return {
        name: "node-stubs",
        enforce: "pre",
        resolveId(id) {
            if (STUBS.has(id) || id === "crypto" || id === "node:crypto") return PREFIX + id;
        },
        load(id) {
            if (!id.startsWith(PREFIX)) return;
            // core-sdk imports randomUUID from Node's crypto (for its file storage,
            // unused in the browser); forward it to the browser's Web Crypto.
            if (id.endsWith("crypto")) {
                return `
export const randomUUID = () => globalThis.crypto.randomUUID();
export default { randomUUID };
`;
            }
            return `
export default {};
export const readFile = () => Promise.resolve("");
export const writeFile = () => Promise.resolve();
export const mkdir = () => Promise.resolve();
export const rename = () => Promise.resolve();
export const join = (...parts) => parts.join("/");
export const dirname = (p) => p.split("/").slice(0, -1).join("/");
export const resolve = (...parts) => parts.join("/");
export class EventEmitter {}
export class Readable {}
`;
        },
    };
}

export default defineConfig({
    resolve: {
        alias: {
            "@privacy-pools-v2/evm-sdk": resolve(root, "packages/evm-sdk/src/external.ts"),
        },
    },
    // Lets an HTTPS tunnel (e.g. cloudflared) serve the dev server, so a phone or
    // second device can run WebAuthn, which needs https or localhost.
    server: { allowedHosts: true },
    plugins: [
        nodeStubs(),
        nodePolyfills({ include: ["buffer"], globals: { Buffer: true, global: true, process: true } }),
    ],
});
