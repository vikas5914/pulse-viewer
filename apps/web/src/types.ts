export type PulseEvent = {
  kind: "message" | "network-created" | "network-progress" | "network-completed";
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
