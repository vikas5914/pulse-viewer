import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { startMdns } from "./mdns";
import { startTcp } from "./tcp";
import { startWeb } from "./web";
import type { PulseEvent } from "./protocol";
import { closeLzfse } from "./lzfse";

const command = Bun.argv[2];
const defaultWebPort = 50513;

function getServiceName() {
  return process.env.PULSE_LISTEN_NAME?.trim() || getMacComputerName() || hostname().replace(/\.local$/i, "");
}

function getServiceHost() {
  const name = getMacLocalHostName();
  return name ? `${name.replace(/\.local$/i, "")}.local` : undefined;
}

function getMacComputerName() {
  return getMacSystemName("ComputerName");
}

function getMacLocalHostName() {
  return getMacSystemName("LocalHostName");
}

function getMacSystemName(key: "ComputerName" | "LocalHostName") {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const name = execFileSync("scutil", ["--get", key], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return name || null;
  } catch {
    return null;
  }
}

function getWebPort() {
  const raw = process.env.PULSE_LISTEN_WEB_PORT;
  if (raw === undefined || raw.trim() === "") {
    return defaultWebPort;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PULSE_LISTEN_WEB_PORT: ${raw}`);
  }
  return port;
}

if (command === "probe") {
  const tcp = Bun.listen({
    hostname: "0.0.0.0",
    port: 0,
    socket: {
      open(socket) {
        console.log(`pulse client connected: ${socket.remoteAddress}:${socket.remotePort}`);
      },
      data() {},
      close() {
        console.log("pulse client disconnected");
      },
      error(_, error) {
        console.error(error.message);
      },
    },
  });
  const serviceName = getServiceName();
  const mdns = startMdns(serviceName, tcp.port, getServiceHost());

  console.log(`service: ${serviceName}`);
  console.log(`tcp: ${tcp.port}`);
  console.log("waiting for pulse client connection");

  function stop() {
    mdns.stop();
    tcp.stop(true);
    process.exit(0);
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await new Promise(() => {});
}

if (command !== "listen") {
  console.error("usage: bun run src/cli.ts listen");
  console.error("usage: bun run src/cli.ts probe");
  process.exit(1);
}

const db = openDb(join(process.cwd(), "pulse-listen.db"));
const web = startWeb(db, getWebPort());
const tcp = await startTcp((event) => {
  if (event.kind === "message") {
    let line = `[${event.createdAt}]`;
    if (event.level !== null) {
      line += ` ${event.level}`;
    }
    if (event.message !== null) {
      line += ` ${event.message}`;
    }
    console.log(line);
  } else if (event.kind === "network-created") {
    let line = `[${event.createdAt}] network`;
    if (event.method !== null) {
      line += ` ${event.method}`;
    }
    if (event.url !== null) {
      line += ` ${event.url}`;
    }
    console.log(line);
  } else if (event.kind === "network-completed") {
    let line = `[${event.createdAt}] network`;
    if (event.method !== null) {
      line += ` ${event.method}`;
    }
    if (event.url !== null) {
      line += ` ${event.url}`;
    }
    if (event.statusCode !== null) {
      line += ` ${event.statusCode}`;
    }
    if (event.error !== null) {
      line += ` ${event.error}`;
    }
    console.log(line);
  }

  db.insert(event);
  web.publish(event);
});
const serviceName = getServiceName();
const mdns = startMdns(serviceName, tcp.port, getServiceHost());

console.log(`service: ${serviceName}`);
console.log(`tcp: ${tcp.port}`);
console.log(`web: http://localhost:${web.port}`);
console.log(`sqlite: ${db.path}`);

async function stop() {
  mdns.stop();
  tcp.stop();
  web.stop();
  db.close();
  await closeLzfse();
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

await new Promise(() => {});
