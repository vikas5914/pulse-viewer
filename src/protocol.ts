import { fileURLToPath } from "node:url";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const appleReferenceDate = 978307200000;

export const packetCode = {
  clientHello: 0,
  serverHello: 1,
  pause: 2,
  resume: 3,
  ping: 6,
  storeEventMessageStored: 7,
  storeEventNetworkTaskCreated: 8,
  storeEventNetworkTaskProgressUpdated: 9,
  storeEventNetworkTaskCompleted: 10,
  message: 13,
} as const;

export type Packet = {
  code: number;
  body: Uint8Array;
};

export type PulseEvent = {
  kind: "message" | "network-created" | "network-completed";
  createdAt: string;
  label: string | null;
  level: string | null;
  message: string | null;
  taskId: string | null;
  method: string | null;
  url: string | null;
  statusCode: number | null;
  error: string | null;
  requestBodySize: number | null;
  responseBodySize: number | null;
  payloadJson: string;
};

type MessageStored = {
  createdAt: number;
  label: string;
  level: number;
  message: string;
};

type NetworkRequest = {
  url: string | null;
  httpMethod: string | null;
};

type NetworkTaskCreated = {
  taskId: string;
  createdAt: number;
  originalRequest: NetworkRequest;
  label: string | null;
};

type NetworkTaskCompleted = {
  taskId: string;
  createdAt: number;
  originalRequest: NetworkRequest;
  response: {
    statusCode: number | null;
  } | null;
  error: {
    debugDescription: string;
  } | null;
  label: string | null;
};

export function getSidecarPath() {
  let fileName = "pulse-lzfse";
  if (process.platform === "win32") {
    fileName = "pulse-lzfse.exe";
  }
  return fileURLToPath(new URL(`../bin/${fileName}`, import.meta.url));
}

export function makeHandshakePackets() {
  return {
    serverHello: encodeJsonPacket(packetCode.serverHello, { version: "4.0.0" }),
    resume: encodeJsonPacket(packetCode.resume, {}),
    ping: encodeJsonPacket(packetCode.ping, {}),
  };
}

export function encodeJsonPacket(code: number, body: unknown) {
  return encodePacket(code, encoder.encode(JSON.stringify(body)));
}

export function encodePacket(code: number, body: Uint8Array) {
  const compressed = runSidecar("compress", body);
  const header = Buffer.alloc(5);
  header[0] = code;
  header.writeUInt32BE(compressed.byteLength, 1);
  return Buffer.concat([header, Buffer.from(compressed)]);
}

export function takePackets(buffer: Buffer) {
  const packets: Packet[] = [];
  let offset = 0;

  while (buffer.length - offset >= 5) {
    const size = buffer.readUInt32BE(offset + 1);
    if (buffer.length - offset < size + 5) {
      break;
    }
    packets.push({
      code: buffer.readUInt8(offset),
      body: runSidecar("decompress", buffer.subarray(offset + 5, offset + size + 5)),
    });
    offset += size + 5;
  }

  return {
    buffer: buffer.subarray(offset),
    packets,
  };
}

export function decodeEvent(packet: Packet) {
  if (packet.code === packetCode.storeEventMessageStored) {
    const event = JSON.parse(decoder.decode(packet.body)) as MessageStored;
    let level = "debug";
    if (event.level === 1) {
      level = "trace";
    } else if (event.level === 2) {
      level = "debug";
    } else if (event.level === 3) {
      level = "info";
    } else if (event.level === 4) {
      level = "notice";
    } else if (event.level === 5) {
      level = "warning";
    } else if (event.level === 6) {
      level = "error";
    } else if (event.level === 7) {
      level = "critical";
    }
    return {
      kind: "message",
      createdAt: new Date(appleReferenceDate + event.createdAt * 1000).toISOString(),
      label: event.label,
      level,
      message: event.message,
      taskId: null,
      method: null,
      url: null,
      statusCode: null,
      error: null,
      requestBodySize: null,
      responseBodySize: null,
      payloadJson: JSON.stringify(event),
    } satisfies PulseEvent;
  }

  if (packet.code === packetCode.storeEventNetworkTaskCreated) {
    const event = JSON.parse(decoder.decode(packet.body)) as NetworkTaskCreated;
    return {
      kind: "network-created",
      createdAt: new Date(appleReferenceDate + event.createdAt * 1000).toISOString(),
      label: event.label,
      level: null,
      message: null,
      taskId: event.taskId,
      method: event.originalRequest.httpMethod,
      url: event.originalRequest.url,
      statusCode: null,
      error: null,
      requestBodySize: null,
      responseBodySize: null,
      payloadJson: JSON.stringify(event),
    } satisfies PulseEvent;
  }

  if (packet.code === packetCode.storeEventNetworkTaskCompleted) {
    const header = Buffer.from(packet.body);
    const messageSize = header.readUInt32BE(0);
    const requestBodySize = header.readUInt32BE(4);
    const responseBodySize = header.readUInt32BE(8);
    const event = JSON.parse(
      decoder.decode(packet.body.subarray(12, 12 + messageSize)),
    ) as NetworkTaskCompleted;
    let statusCode = null;
    if (event.response !== null) {
      statusCode = event.response.statusCode;
    }
    let error = null;
    if (event.error !== null) {
      error = event.error.debugDescription;
    }
    return {
      kind: "network-completed",
      createdAt: new Date(appleReferenceDate + event.createdAt * 1000).toISOString(),
      label: event.label,
      level: null,
      message: null,
      taskId: event.taskId,
      method: event.originalRequest.httpMethod,
      url: event.originalRequest.url,
      statusCode,
      error,
      requestBodySize,
      responseBodySize,
      payloadJson: JSON.stringify({
        ...event,
        requestBodySize,
        responseBodySize,
      }),
    } satisfies PulseEvent;
  }

  return null;
}

function runSidecar(mode: "compress" | "decompress", input: Uint8Array) {
  const result = Bun.spawnSync({
    cmd: [getSidecarPath(), mode],
    stdin: input,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    let message = `pulse-lzfse ${mode} failed`;
    const stderr = decoder.decode(result.stderr);
    if (stderr.length > 0) {
      message += `: ${stderr}`;
    }
    throw new Error(message);
  }

  return new Uint8Array(result.stdout);
}
