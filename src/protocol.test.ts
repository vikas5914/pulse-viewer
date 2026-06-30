import { expect, test } from "bun:test";
import { decodeEvent, encodeJsonPacket, packetCode, takePackets } from "./protocol";

test("round trips packet framing", () => {
  const packet = encodeJsonPacket(packetCode.clientHello, {
    version: "4.0.0",
  });
  const parsed = takePackets(packet);

  expect(parsed.buffer.byteLength).toBe(0);
  expect(parsed.packets).toHaveLength(1);
  expect(parsed.packets[0]?.code).toBe(packetCode.clientHello);
  expect(new TextDecoder().decode(parsed.packets[0]!.body)).toBe('{"version":"4.0.0"}');
});

test("decodes completed network task packet", () => {
  const message = Buffer.from(
    JSON.stringify({
      taskId: "task-1",
      createdAt: 0,
      originalRequest: {
        url: "https://example.com",
        httpMethod: "GET",
      },
      response: {
        statusCode: 200,
      },
      error: null,
      label: "api",
    }),
  );
  const body = Buffer.concat([
    Buffer.from([0, 0, 0, message.length]),
    Buffer.from([0, 0, 0, 3]),
    Buffer.from([0, 0, 0, 4]),
    message,
    Buffer.from("req"),
    Buffer.from("resp"),
  ]);

  const event = decodeEvent({
    code: packetCode.storeEventNetworkTaskCompleted,
    body,
  });

  expect(event).not.toBeNull();
  expect(event?.kind).toBe("network-completed");
  expect(event?.statusCode).toBe(200);
  expect(event?.requestBodySize).toBe(3);
  expect(event?.responseBodySize).toBe(4);
});
