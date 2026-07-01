import {
  decodeEvent,
  makeHandshakePackets,
  packetCode,
  takePackets,
  type PulseEvent,
} from "./protocol";

type SocketState = {
  buffer: Buffer;
  ping: Timer | null;
  queue: Promise<void>;
};

export async function startTcp(onEvent: (event: PulseEvent) => void, port: number) {
  const packets = await makeHandshakePackets();
  const server = Bun.listen<SocketState>({
    hostname: "0.0.0.0",
    port,
    socket: {
      open(socket) {
        console.log(`pulse client connected: ${socket.remoteAddress}:${socket.remotePort}`);
        socket.data = {
          buffer: Buffer.alloc(0),
          ping: null,
          queue: Promise.resolve(),
        };
      },
      data(socket, data) {
        socket.data.queue = socket.data.queue.then(async () => {
          socket.data.buffer = Buffer.concat([socket.data.buffer, data]);
          const batch = await takePackets(socket.data.buffer);
          socket.data.buffer = batch.buffer;

          for (const packet of batch.packets) {
            if (packet.code === packetCode.clientHello) {
              socket.write(packets.serverHello);
              socket.write(packets.resume);
              console.log("pulse client handshake complete");
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
        }).catch((error) => {
          if (socket.data.ping !== null) {
            clearInterval(socket.data.ping);
            socket.data.ping = null;
          }
          console.error(error instanceof Error ? error.message : String(error));
          try {
            socket.end();
          } catch {
            // Ignore shutdown errors after a protocol failure.
          }
        });
      },
      close(socket) {
        if (socket.data.ping !== null) {
          clearInterval(socket.data.ping);
        }
        console.log("pulse client disconnected");
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
