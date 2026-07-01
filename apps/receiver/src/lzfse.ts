import { existsSync, readFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

type Mode = "compress" | "decompress";

type Codec = {
  run(mode: Mode, input: Uint8Array): Promise<Uint8Array>;
  close(): void;
};

type WasmCodecResult = {
  ok: boolean;
  data?: Uint8Array;
  error?: string;
};

let codecPromise: Promise<Codec> | null = null;

export async function runLzfse(mode: Mode, input: Uint8Array) {
  codecPromise ??= createCodec();
  const codec = await codecPromise;
  return codec.run(mode, input);
}

export async function closeLzfse() {
  const codec = await codecPromise;
  codec?.close();
  codecPromise = null;
}

export function getSidecarPath() {
  let fileName = "pulse-lzfse";
  if (process.platform === "win32") {
    fileName = "pulse-lzfse.exe";
  }
  return fileURLToPath(new URL(`../../../bin/${fileName}`, import.meta.url));
}

async function createCodec(): Promise<Codec> {
  const sidecarPath = getSidecarPath();
  if (existsSync(sidecarPath)) {
    return new NativeCodec(sidecarPath);
  }
  return WasmCodec.create();
}

class NativeCodec implements Codec {
  private child: ChildProcessWithoutNullStreams;
  private stdout = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private queue: Promise<Uint8Array> = Promise.resolve(new Uint8Array());

  constructor(path: string) {
    this.child = spawn(path, ["serve"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdout = Buffer.concat([this.stdout, chunk]);
      for (const waiter of this.waiters.splice(0)) {
        waiter();
      }
    });
  }

  async run(mode: Mode, input: Uint8Array) {
    const request = this.queue.then(() => this.request(mode, input));
    this.queue = request.catch(() => new Uint8Array());
    return request;
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }

  private async request(mode: Mode, input: Uint8Array) {
    const header = Buffer.alloc(5);
    header[0] = mode === "compress" ? "c".charCodeAt(0) : "d".charCodeAt(0);
    header.writeUInt32BE(input.byteLength, 1);
    this.child.stdin.write(Buffer.concat([header, Buffer.from(input)]));

    const responseHeader = await this.readExactly(5);
    const size = responseHeader.readUInt32BE(1);
    const payload = await this.readExactly(size);
    if (responseHeader[0] !== 1) {
      throw new Error(payload.toString("utf8"));
    }
    return new Uint8Array(payload);
  }

  private async readExactly(size: number): Promise<Buffer> {
    while (this.stdout.byteLength < size) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    const output = this.stdout.subarray(0, size);
    this.stdout = this.stdout.subarray(size);
    return output;
  }
}

class WasmCodec implements Codec {
  private constructor(
    private api: {
      compress(input: Uint8Array): WasmCodecResult;
      decompress(input: Uint8Array): WasmCodecResult;
    },
  ) {}

  static async create() {
    const wasmExecPath = fileURLToPath(new URL("../../../dist/wasm/wasm_exec.js", import.meta.url));
    const wasmPath = fileURLToPath(new URL("../../../dist/wasm/pulse-lzfse.wasm", import.meta.url));
    if (!existsSync(wasmExecPath) || !existsSync(wasmPath)) {
      throw new Error(
        `missing LZFSE native sidecar at ${getSidecarPath()} and missing WASM artifacts; run bun run build:wasm`,
      );
    }

    new Function(readFileSync(wasmExecPath, "utf8"))();

    const go = new globalThis.Go();
    const wasm = await WebAssembly.instantiate(readFileSync(wasmPath), go.importObject as any);
    void go.run(wasm.instance);

    while (!globalThis.pulseLzfse) {
      await Bun.sleep(1);
    }
    return new WasmCodec(globalThis.pulseLzfse);
  }

  async run(mode: Mode, input: Uint8Array) {
    const result = this.api[mode](input);
    if (!result.ok || !result.data) {
      throw new Error(`pulse-lzfse ${mode} failed: ${result.error ?? "unknown error"}`);
    }
    return result.data;
  }

  close() {}
}

declare global {
  var Go: new () => {
    importObject: unknown;
    run(instance: WebAssembly.Instance): Promise<void>;
  };
  var pulseLzfse:
    | {
        compress(input: Uint8Array): WasmCodecResult;
        decompress(input: Uint8Array): WasmCodecResult;
      }
    | undefined;
}
