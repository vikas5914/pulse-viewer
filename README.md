# pulse-listen

`pulse-listen` is a Bun receiver for Pulse `RemoteLogger`. It advertises `_pulse._tcp`, accepts the TCP connection from an iOS/macOS Pulse client, decodes incoming packets, stores events in memory, and mirrors them into a local React web UI over WebSocket.

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
- storage mode

The Pulse TCP receiver uses port `50512`.

By default, the web UI uses a stable port:

```bash
http://localhost:50513
```

Override it with `PULSE_LISTEN_WEB_PORT` if needed:

```bash
PULSE_LISTEN_WEB_PORT=8080 bun run listen
```

On startup, the listener asks which network interface to use for mDNS. For non-interactive runs, set `PULSE_LISTEN_INTERFACE` to the LAN IPv4 address:

```powershell
$env:PULSE_LISTEN_INTERFACE = "192.168.1.16"
bun run listen
```

Events are stored in memory and are cleared when the listener exits.

## Firewall note

Discovery depends on mDNS/Bonjour traffic over UDP `5353`, and the Pulse client must also reach the advertised TCP port.

On Windows, run PowerShell as Administrator and add the required Private-network rules:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-firewall-rules.ps1
```

The script allows `bun.exe` to receive TCP connections on port `50512` from `LocalSubnet`, and allows `bun.exe` to receive mDNS traffic on UDP `5353` from `LocalSubnet`.

If discovery or connection still fails, make sure:

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
