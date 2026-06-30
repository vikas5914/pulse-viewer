import { hostname } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { startMdns } from "./mdns";
import { startTcp } from "./tcp";
import { startWeb } from "./web";
import type { PulseEvent } from "./protocol";

const command = Bun.argv[2];

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
  const serviceName = `pulse-listen-${hostname()}`;
  const mdns = startMdns(serviceName, tcp.port);

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
const web = startWeb(db);
const tcp = startTcp((event) => {
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
const serviceName = `pulse-listen-${hostname()}`;
const mdns = startMdns(serviceName, tcp.port);

console.log(`service: ${serviceName}`);
console.log(`tcp: ${tcp.port}`);
console.log(`web: http://localhost:${web.port}`);
console.log(`sqlite: ${db.path}`);

function stop() {
  mdns.stop();
  tcp.stop();
  web.stop();
  db.close();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await new Promise(() => {});
