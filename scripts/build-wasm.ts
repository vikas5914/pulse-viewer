import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outDir = join(root, "dist", "wasm");
const goroot = (await Bun.$`go env GOROOT`.text()).trim();

await mkdir(outDir, { recursive: true });
await Bun.$`env CGO_ENABLED=0 GOOS=js GOARCH=wasm go build -C ${join(root, "sidecars", "pulse-lzfse")} -trimpath -o ${join(outDir, "pulse-lzfse.wasm")} ./wasm`;
await copyFile(join(goroot, "lib", "wasm", "wasm_exec.js"), join(outDir, "wasm_exec.js"));

console.log(`built ${join(outDir, "pulse-lzfse.wasm")}`);
console.log(`copied ${join(outDir, "wasm_exec.js")}`);
