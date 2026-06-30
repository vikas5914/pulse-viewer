# pulse-listen

`pulse-listen` is a Bun receiver for Pulse `RemoteLogger`. It advertises `_pulse._tcp`, accepts the TCP connection from an iOS/macOS Pulse client, decodes incoming packets, stores events in SQLite, and mirrors them into a tiny local web UI over WebSocket.

## Setup

Install Bun dependencies:

```bash
bun install
```

Build the LZFSE sidecar:

Windows:

```bash
go build -C cmd/pulse-lzfse -o ../../bin/pulse-lzfse.exe .
```

macOS/Linux:

```bash
go build -C cmd/pulse-lzfse -o ../../bin/pulse-lzfse .
```

## Run

```bash
bun run src/cli.ts listen
```

The listener prints:

- advertised service name
- TCP port
- local web URL
- SQLite path

The web UI is served on `http://localhost:<port>`.

The SQLite database is created as `pulse-listen.db` in the current working directory.

## Firewall note

Discovery depends on mDNS/Bonjour traffic over UDP `5353`, and the Pulse client must also reach the advertised TCP port.

On Windows, the first run may trigger a firewall prompt for Bun. If discovery fails, allow Bun on the active network and make sure:

- UDP `5353` multicast is not blocked
- the advertised TCP port is reachable on the local network

## Known limitations

- MVP is plain TCP only. Pulse passcode/TLS mode is not implemented.
- LZFSE currently uses a small Go sidecar binary. The Bun app stays in TypeScript, but the sidecar must exist for the current platform.
- mDNS behavior is only as good as the local Bonjour/Avahi stack and firewall rules on the host OS.
- The UI only shows a live event stream and recent history. It does not render full Pulse detail views.

## Later packaging target

Standalone Bun builds are still out of scope for this prototype, but the intended commands are:

```bash
bun build --compile --target=bun-windows-x64 src/cli.ts --outfile dist/pulse-listen.exe
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/pulse-listen-macos-arm64
bun build --compile --target=bun-linux-x64 src/cli.ts --outfile dist/pulse-listen-linux-x64
```
