import { useEffect, useMemo, useRef, useState } from "react";
import type { PulseEvent } from "./types";

const maxEvents = 500;

export function App() {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const selected = selectedIndex >= 0 ? events[selectedIndex] : undefined;

  useEffect(() => {
    let cancelled = false;
    fetch("/events")
      .then((response) => response.json() as Promise<PulseEvent[]>)
      .then((items) => {
        if (cancelled) return;
        setEvents(items.slice(-maxEvents));
        setSelectedIndex(items.length > 0 ? Math.min(items.length, maxEvents) - 1 : -1);
      });

    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as PulseEvent;
      setEvents((current) => {
        const next = [...current, event].slice(-maxEvents);
        setSelectedIndex(next.length - 1);
        return next;
      });
    };

    return () => {
      cancelled = true;
      socket.close();
    };
  }, []);

  return (
    <main className="shell">
      <EventList events={events} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
      <EventDetail event={selected} />
    </main>
  );
}

function EventList({
  events,
  selectedIndex,
  onSelect,
}: {
  events: PulseEvent[];
  selectedIndex: number;
  onSelect(index: number): void;
}) {
  return (
    <section className="list">
      <div className="toolbar">
        <div className="title">Pulse events</div>
        <div className="count">{events.length}</div>
      </div>
      <div>
        {events.map((event, index) => (
          <EventRow
            event={event}
            isActive={index === selectedIndex}
            key={`${event.createdAt}-${event.taskId ?? ""}-${index}`}
            onClick={() => onSelect(index)}
          />
        ))}
      </div>
    </section>
  );
}

function EventRow({
  event,
  isActive,
  onClick,
}: {
  event: PulseEvent;
  isActive: boolean;
  onClick(): void;
}) {
  const payload = usePayload(event);
  const method = event.method || event.level || event.kind;
  const target = event.url || event.message || event.kind;
  const status = event.statusCode === null ? "" : String(event.statusCode);
  const requestType = payload.currentRequest?.headers?.["Content-Type"] || payload.originalRequest?.headers?.["Content-Type"];
  const responseType = payload.response?.headers?.["Content-Type"];
  const meta = [event.kind, event.label, requestType, responseType, event.error].filter(Boolean).join(" / ");
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);

  return (
    <button className={isActive ? "row active" : "row"} onClick={onClick} ref={rowRef} type="button">
      <div className="method">{method}</div>
      <div className="main">
        <div className="url">{target}</div>
      </div>
      <div className="status">{status}</div>
      <div className="time">{formatTime(event.createdAt)}</div>
      <div className="meta">{meta}</div>
    </button>
  );
}

function EventDetail({ event }: { event?: PulseEvent }) {
  const payload = usePayload(event);

  if (!event) {
    return (
      <section className="detail">
        <div className="empty">Select an event to inspect request headers, response headers, bodies, errors, and raw Pulse metadata.</div>
      </section>
    );
  }

  return (
    <section className="detail">
      <h1>{event.url || event.message || event.kind}</h1>
      <div className="summary">{[formatTime(event.createdAt), event.kind, event.method, statusText(event)].filter(Boolean).join("  ")}</div>
      <Section
        title="Overview"
        data={{
          kind: event.kind,
          method: event.method,
          url: event.url,
          status: statusText(event),
          label: event.label,
          taskId: event.taskId,
          level: event.level,
          message: event.message,
          error: event.error,
          requestBodySize: event.requestBodySize,
          responseBodySize: event.responseBodySize,
        }}
      />
      <RequestSection title="Original request" request={payload.originalRequest} />
      <RequestSection title="Current request" request={payload.currentRequest} />
      <ResponseSection response={payload.response} />
      <BodySection body={payload.requestBody} title="Request body" />
      <BodySection body={payload.responseBody} title="Response body" />
      {payload.error ? <Section data={payload.error} title="Error" /> : null}
      {payload.metrics ? <Section data={payload.metrics} title="Metrics" /> : null}
      <Section data={payload} title="Raw payload" />
    </section>
  );
}

function RequestSection({ title, request }: { title: string; request: any }) {
  if (!request) return null;
  return (
    <>
      <Section
        title={title}
        data={{
          method: request.httpMethod,
          url: request.url,
          timeout: request.timeout,
          cachePolicy: request.rawCachePolicy,
          options: request.options,
          contentType: request.headers?.["Content-Type"],
        }}
      />
      <Section data={request.headers || {}} title={`${title} headers`} />
    </>
  );
}

function ResponseSection({ response }: { response: any }) {
  if (!response) return null;
  return (
    <>
      <Section
        title="Response"
        data={{
          statusCode: response.statusCode,
          contentType: response.headers?.["Content-Type"],
          contentLength: response.headers?.["Content-Length"],
          contentEncoding: response.headers?.["Content-Encoding"],
        }}
      />
      <Section data={response.headers || {}} title="Response headers" />
    </>
  );
}

function BodySection({ title, body }: { title: string; body: any }) {
  if (!body) {
    return (
      <>
        <h2>{title}</h2>
        <pre>Not captured for this event. Older events captured before body storage was added will not include body data.</pre>
      </>
    );
  }
  if (!body.size) {
    return (
      <>
        <h2>{title} (0 bytes)</h2>
        <pre>Empty body.</pre>
      </>
    );
  }
  return (
    <>
      <h2>
        {title} ({body.size} bytes)
      </h2>
      <pre>{body.text ?? (body.base64 ? `Binary body shown as base64:\n\n${body.base64}` : "Body metadata is present, but no text or base64 payload was captured.")}</pre>
    </>
  );
}

function Section({ title, data }: { title: string; data: any }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  return (
    <>
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <pre>{stringify(data ?? {})}</pre>
      ) : (
        <div className="grid">
          {entries.map(([key, value]) => (
            <FragmentRow itemKey={key} key={key} value={value} />
          ))}
        </div>
      )}
    </>
  );
}

function FragmentRow({ itemKey, value }: { itemKey: string; value: unknown }) {
  return (
    <>
      <div className="key">{itemKey}</div>
      <div className="value">{typeof value === "object" ? stringify(value) : String(value)}</div>
    </>
  );
}

function usePayload(event?: PulseEvent): any {
  return useMemo(() => {
    if (!event) return {};
    try {
      return JSON.parse(event.payloadJson || "{}");
    } catch {
      return {};
    }
  }, [event]);
}

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function statusText(event: PulseEvent) {
  return event.statusCode === null ? "" : String(event.statusCode);
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}
