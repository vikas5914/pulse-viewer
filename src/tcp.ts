import {
  decodeEvent,
  getSidecarPath,
  makeHandshakePackets,
  packetCode,
  takePackets,
  type PulseEvent,
} from "./protocol";
import { existsSync } from "node:fs";

type SocketState = {
  buffer: Buffer;
  ping: Timer | null;
};

export function startTcp(onEvent: (event: PulseEvent) => void) {
  const sidecarPath = getSidecarPath();
  if (!existsSync(sidecarPath)) {
    throw new Error(`missing sidecar binary at ${sidecarPath}`);
  }

  const packets = makeHandshakePackets();
  const server = Bun.listen<SocketState>({
    hostname: "0.0.0.0",
    port: 0,
    socket: {
      open(socket) {
        socket.data = {
          buffer: Buffer.alloc(0),
          ping: null,
        };
      },
      data(socket, data) {
        socket.data.buffer = Buffer.concat([socket.data.buffer, data]);
        const batch = takePackets(socket.data.buffer);
        socket.data.buffer = batch.buffer;

        for (const packet of batch.packets) {
          if (packet.code === packetCode.clientHello) {
            socket.write(packets.serverHello);
            socket.write(packets.resume);
            if (socket.data.ping === null) {
              socket.data.ping = setInterval(() => {
                socket.write(packets.ping);
              }, 2000);
            }
            continue;
          }

          const event = decodeEvent(packet);
          if (event !== null) {
            onEvent(event);
          }
        }
      },
      close(socket) {
        if (socket.data.ping !== null) {
          clearInterval(socket.data.ping);
        }
      },
      error(socket, error) {
        if (socket.data.ping !== null) {
          clearInterval(socket.data.ping);
        }
        console.error(error.message);
      },
    },
  });

  return {
    port: server.port,
    stop() {
      server.stop(true);
    },
  };
}
