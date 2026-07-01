import type { PulseEvent } from "./protocol";

export function openDb() {
  const events: PulseEvent[] = [];
  return {
    close() {},
    insert(event: PulseEvent) {
      events.push(event);
    },
    list(limit = 200) {
      return events.slice(-limit);
    },
  };
}
