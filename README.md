# pulse-listen

`pulse-listen` is a Bun receiver for Pulse `RemoteLogger`. It advertises `_pulse._tcp`, accepts the TCP connection from an iOS/macOS Pulse client, decodes incoming packets, stores events in SQLite, and mirrors them into a local React web UI over WebSocket.

## Layout

```text
apps/
  receiver/  # Bun mDNS/TCP/WebSocket process
  web/       # React UI bundled directly by Bun
cmd/
  pulse-lzfse/  # Go LZFSE sidecar and WASM wrapper
scripts/
  build-wasm.ts
```

## Setup

Install Bun dependencies:

```bash
bun install
```

Build the LZFSE WASM module:

```bash
bun run build:wasm
```

This writes `dist/wasm/pulse-lzfse.wasm` and `dist/wasm/wasm_exec.js`.

For best performance, build the native LZFSE sidecar for the current platform:

```bash
go build -C cmd/pulse-lzfse -o ../../bin/pulse-lzfse .
```

On Windows:

```bash
go build -C cmd/pulse-lzfse -o ../../bin/pulse-lzfse.exe .
```

At runtime, `pulse-listen` uses the native sidecar in long-lived `serve` mode when it exists. If the native sidecar is missing, it falls back to the Go `js/wasm` module.

## Run

```bash
bun run listen
```

The listener prints:

- advertised service name
- TCP port
- local web URL
- SQLite path

The web UI is served on `http://localhost:<port>`.

By default, the web UI uses a stable port:

```bash
http://localhost:50513
```

Override it with `PULSE_LISTEN_WEB_PORT` if needed:

```bash
PULSE_LISTEN_WEB_PORT=8080 bun run listen
```

The SQLite database is created as `pulse-listen.db` in the current working directory.

## Firewall note

Discovery depends on mDNS/Bonjour traffic over UDP `5353`, and the Pulse client must also reach the advertised TCP port.

On Windows, the first run may trigger a firewall prompt for Bun. If discovery fails, allow Bun on the active network and make sure:

- UDP `5353` multicast is not blocked
- the advertised TCP port is reachable on the local network

## Known limitations

- MVP is plain TCP only. Pulse passcode/TLS mode is not implemented.
- LZFSE uses a long-lived Go sidecar when available and falls back to Go `js/wasm` when native binaries are unavailable.
- mDNS behavior is only as good as the local Bonjour/Avahi stack and firewall rules on the host OS.
- The UI shows recent events with request and response details, but it is not yet a full Pulse app replacement.

## Later packaging target

Standalone Bun builds are still out of scope for this prototype, but the intended commands are:

```bash
bun build --compile --target=bun-windows-x64 apps/receiver/src/cli.ts --outfile dist/pulse-listen.exe
bun build --compile --target=bun-darwin-arm64 apps/receiver/src/cli.ts --outfile dist/pulse-listen-macos-arm64
bun build --compile --target=bun-linux-x64 apps/receiver/src/cli.ts --outfile dist/pulse-listen-linux-x64
```
