import { Bonjour } from "bonjour-service";

export function startMdns(name: string, port: number) {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name,
    port,
    protocol: "tcp",
    type: "pulse",
  });

  return {
    stop() {
      service.stop();
      bonjour.destroy();
    },
  };
}
