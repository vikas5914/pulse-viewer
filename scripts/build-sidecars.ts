import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type Target = {
  goos: string;
  goarch: string;
  fileName: string;
};

const root = join(import.meta.dir, "..");
const sidecarDir = join(root, "sidecars", "pulse-lzfse");
const outDir = join(root, "dist", "sidecars");

const targets: Target[] = [
  { goos: "windows", goarch: "amd64", fileName: "pulse-lzfse-windows-amd64.exe" },
  { goos: "darwin", goarch: "arm64", fileName: "pulse-lzfse-darwin-arm64" },
  { goos: "linux", goarch: "amd64", fileName: "pulse-lzfse-linux-amd64" },
];

await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const outPath = join(outDir, target.fileName);
  const proc = Bun.spawn(
    ["go", "build", "-C", sidecarDir, "-trimpath", "-o", outPath, "./native"],
    {
      env: {
        ...process.env,
        CGO_ENABLED: "0",
        GOOS: target.goos,
        GOARCH: target.goarch,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`failed to build ${target.fileName}`);
  }
  console.log(`built ${outPath}`);
}
