import { Bonjour } from "bonjour-service";
import { networkInterfaces } from "node:os";

export function startMdns(name: string, port: number, host?: string) {
  const interfaces: Array<{ name: string; address: string }> = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (addresses === undefined) {
      continue;
    }
    for (const address of addresses) {
      if (address.family === "IPv4") {
        interfaces.push({ name, address: address.address });
      }
    }
  }

  let interfaceAddress = process.env.PULSE_LISTEN_INTERFACE?.trim();
  if (interfaceAddress === undefined) {
    interfaceAddress = "";
  }
  if (interfaceAddress === "") {
    if (interfaces.length === 0) {
      throw new Error("no IPv4 network interfaces found");
    }
    console.log("network interfaces:");
    for (let index = 0; index < interfaces.length; index++) {
      const item = interfaces[index]!;
      console.log(`${index + 1}. ${item.name} (${item.address})`);
    }
    const answer = prompt("select interface: ");
    if (answer === null) {
      throw new Error("network interface selection cancelled");
    }
    const selected = Number(answer.trim());
    if (!Number.isInteger(selected)) {
      throw new Error(`invalid network interface: ${answer}`);
    }
    if (selected < 1) {
      throw new Error(`invalid network interface: ${answer}`);
    }
    if (selected > interfaces.length) {
      throw new Error(`invalid network interface: ${answer}`);
    }
    interfaceAddress = interfaces[selected - 1]!.address;
  }
  const options = { interface: interfaceAddress, port: 5353 };
  const bonjour = new Bonjour(options);
  const service = bonjour.publish({
    disableIPv6: true,
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
