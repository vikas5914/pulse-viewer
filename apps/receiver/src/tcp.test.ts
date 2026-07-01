import { expect, test } from "bun:test";
import { encodeJsonPacket, packetCode, takePackets } from "./protocol";
import { startTcp } from "./tcp";

test("handshakes and receives a message event", async () => {
  const events: string[] = [];
  const server = await startTcp((event) => {
    if (event.message !== null) {
      events.push(event.message);
    }
  });

  const received = await new Promise<number[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    Bun.connect({
      hostname: "127.0.0.1",
      port: server.port,
      socket: {
        open(socket) {
          Promise.all([
            encodeJsonPacket(packetCode.clientHello, { version: "4.0.0" }),
            encodeJsonPacket(packetCode.storeEventMessageStored, {
              createdAt: 0,
              label: "app",
              level: 3,
              message: "hello from test",
            }),
          ]).then((packets) => socket.write(Buffer.concat(packets)));
        },
        async data(socket, data) {
          chunks.push(data);
          const parsed = await takePackets(Buffer.concat(chunks));
          if (parsed.packets.length >= 2) {
            socket.end();
            resolve(parsed.packets.map((packet) => packet.code));
          }
        },
        connectError(_, error) {
          reject(error);
        },
        error(_, error) {
          reject(error);
        },
      },
    }).catch(reject);
  });

  server.stop();

  expect(received).toEqual([packetCode.serverHello, packetCode.resume]);
  expect(events).toEqual(["hello from test"]);
});
