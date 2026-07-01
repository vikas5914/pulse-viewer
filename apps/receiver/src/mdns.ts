import { Bonjour } from "bonjour-service";

export function startMdns(name: string, port: number, host?: string) {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    host,
    name,
    port,
    protocol: "tcp",
    txt: {
      protected: "false",
    },
    type: "pulse",
  });

  return {
    stop() {
      service.stop();
      bonjour.destroy();
    },
  };
}
