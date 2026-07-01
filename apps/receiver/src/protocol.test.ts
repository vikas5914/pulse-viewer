import { expect, test } from "bun:test";
import { decodeEvent, encodeJsonPacket, packetCode, takePackets } from "./protocol";

test("round trips packet framing", async () => {
  const packet = await encodeJsonPacket(packetCode.clientHello, {
    version: "4.0.0",
  });
  const parsed = await takePackets(packet);

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
  expect(JSON.parse(event!.payloadJson).requestBody.text).toBe("req");
  expect(JSON.parse(event!.payloadJson).responseBody.text).toBe("resp");
});

test("stores binary response bodies as base64", () => {
  const message = Buffer.from(
    JSON.stringify({
      taskId: "task-2",
      createdAt: 0,
      originalRequest: {
        url: "https://example.com/image.png",
        httpMethod: "GET",
      },
      response: {
        statusCode: 200,
      },
      error: null,
      label: "image",
    }),
  );
  const responseBody = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const body = Buffer.concat([
    Buffer.from([0, 0, 0, message.length]),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from([0, 0, 0, responseBody.length]),
    message,
    responseBody,
  ]);

  const event = decodeEvent({
    code: packetCode.storeEventNetworkTaskCompleted,
    body,
  });

  const payload = JSON.parse(event!.payloadJson);
  expect(payload.responseBody.text).toBeNull();
  expect(payload.responseBody.base64).toBe(responseBody.toString("base64"));
});
