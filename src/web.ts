import type { PulseEvent } from "./protocol";

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>pulse-listen</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #111316;
      color: #e8eaed;
      font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button { font: inherit; }
    .shell { display: grid; grid-template-columns: minmax(360px, 44vw) 1fr; min-height: 100vh; }
    .list { border-right: 1px solid #2a2e35; background: #15181d; height: 100vh; overflow: auto; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: #15181d;
      border-bottom: 1px solid #2a2e35;
    }
    .title { font-weight: 650; }
    .count { color: #9aa4b2; font-size: 12px; }
    .row {
      width: 100%;
      display: grid;
      grid-template-columns: 62px 1fr 48px;
      gap: 6px 10px;
      padding: 10px 14px;
      border: 0;
      border-bottom: 1px solid #252932;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .row:hover, .row.active { background: #1d222a; }
    .time { color: #9aa4b2; font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .method { color: #94f0c4; font: 700 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .status { color: #facc15; text-align: right; font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .main { min-width: 0; }
    .url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { grid-column: 2 / 4; color: #9aa4b2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail { height: 100vh; overflow: auto; padding: 18px 20px 32px; }
    .empty { color: #9aa4b2; padding: 18px; }
    h1 { margin: 0 0 6px; font-size: 18px; line-height: 1.25; overflow-wrap: anywhere; }
    h2 { margin: 22px 0 8px; font-size: 13px; color: #c9d1d9; text-transform: uppercase; letter-spacing: .04em; }
    .summary { color: #9aa4b2; margin-bottom: 18px; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .grid { display: grid; grid-template-columns: 170px minmax(0, 1fr); border: 1px solid #2a2e35; border-bottom: 0; }
    .key, .value { padding: 7px 9px; border-bottom: 1px solid #2a2e35; min-width: 0; overflow-wrap: anywhere; }
    .key { color: #9aa4b2; background: #171b21; }
    .value { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      max-height: 360px;
      border: 1px solid #2a2e35;
      background: #0d1014;
      color: #e8eaed;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    @media (max-width: 800px) {
      .shell { grid-template-columns: 1fr; }
      .list, .detail { height: auto; min-height: 50vh; }
      .list { border-right: 0; border-bottom: 1px solid #2a2e35; }
      .grid { grid-template-columns: 1fr; }
      .key { border-bottom: 0; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="list">
      <div class="toolbar">
        <div class="title">Pulse events</div>
        <div class="count" id="count">0</div>
      </div>
      <div id="list"></div>
    </section>
    <section class="detail" id="detail">
      <div class="empty">Select an event to inspect request headers, response headers, bodies, errors, and raw Pulse metadata.</div>
    </section>
  </main>
  <script>
    const list = document.getElementById("list");
    const detail = document.getElementById("detail");
    const count = document.getElementById("count");
    const events = [];
    let selected = -1;

    function parsePayload(event) {
      try {
        return JSON.parse(event.payloadJson || "{}");
      } catch {
        return {};
      }
    }

    function add(event, shouldSelect = true) {
      events.push(event);
      if (events.length > 500) {
        events.shift();
        selected = Math.max(-1, selected - 1);
      }
      if (shouldSelect) {
        selected = events.length - 1;
      }
      renderList();
      renderDetail(events[selected]);
    }

    function renderList() {
      list.textContent = "";
      count.textContent = String(events.length);
      events.forEach((event, index) => {
        const payload = parsePayload(event);
        const row = document.createElement("button");
        row.type = "button";
        row.className = index === selected ? "row active" : "row";
        row.onclick = () => {
          selected = index;
          renderList();
          renderDetail(event);
        };

        const method = event.method || event.level || event.kind;
        const target = event.url || event.message || event.kind;
        const status = event.statusCode === null ? "" : String(event.statusCode);
        const requestType = payload.currentRequest?.headers?.["Content-Type"] || payload.originalRequest?.headers?.["Content-Type"];
        const responseType = payload.response?.headers?.["Content-Type"];
        const meta = [event.kind, event.label, requestType, responseType, event.error].filter(Boolean).join(" / ");

        row.appendChild(el("div", method, "method"));
        const main = el("div", "", "main");
        main.appendChild(el("div", target, "url"));
        row.appendChild(main);
        row.appendChild(el("div", status, "status"));
        row.appendChild(el("div", formatTime(event.createdAt), "time"));
        row.appendChild(el("div", meta, "meta"));
        list.appendChild(row);
      });
      const active = list.querySelector(".active");
      if (active) {
        active.scrollIntoView({ block: "nearest" });
      }
    }

    function renderDetail(event) {
      if (!event) {
        detail.innerHTML = '<div class="empty">Select an event to inspect request headers, response headers, bodies, errors, and raw Pulse metadata.</div>';
        return;
      }
      const payload = parsePayload(event);
      detail.textContent = "";
      detail.appendChild(el("h1", event.url || event.message || event.kind));
      detail.appendChild(el("div", [formatTime(event.createdAt), event.kind, event.method, statusText(event)].filter(Boolean).join("  "), "summary"));
      detail.appendChild(section("Overview", {
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
      }));
      appendRequest("Original request", payload.originalRequest);
      appendRequest("Current request", payload.currentRequest);
      appendResponse("Response", payload.response);
      appendBody("Request body", payload.requestBody);
      appendBody("Response body", payload.responseBody);
      if (payload.error) {
        detail.appendChild(section("Error", payload.error));
      }
      if (payload.metrics) {
        detail.appendChild(section("Metrics", payload.metrics));
      }
      detail.appendChild(section("Raw payload", payload));
    }

    function appendRequest(title, request) {
      if (!request) return;
      detail.appendChild(section(title, {
        method: request.httpMethod,
        url: request.url,
        timeout: request.timeout,
        cachePolicy: request.rawCachePolicy,
        options: request.options,
        contentType: request.headers?.["Content-Type"],
      }));
      detail.appendChild(section(title + " headers", request.headers || {}));
    }

    function appendResponse(title, response) {
      if (!response) return;
      detail.appendChild(section(title, {
        statusCode: response.statusCode,
        contentType: response.headers?.["Content-Type"],
        contentLength: response.headers?.["Content-Length"],
        contentEncoding: response.headers?.["Content-Encoding"],
      }));
      detail.appendChild(section(title + " headers", response.headers || {}));
    }

    function appendBody(title, body) {
      if (!body) {
        detail.appendChild(el("h2", title));
        detail.appendChild(el("pre", "Not captured for this event. Older events captured before body storage was added will not include body data."));
        return;
      }
      detail.appendChild(el("h2", title + " (" + body.size + " bytes)"));
      if (!body.size) {
        detail.appendChild(el("pre", "Empty body."));
        return;
      }
      if (body.text !== null && body.text !== undefined) {
        detail.appendChild(el("pre", body.text));
      } else if (body.base64) {
        detail.appendChild(el("pre", "Binary body shown as base64:\\n\\n" + body.base64));
      } else {
        detail.appendChild(el("pre", "Body metadata is present, but no text or base64 payload was captured."));
      }
    }

    function section(title, data) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(el("h2", title));
      if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
        fragment.appendChild(el("pre", stringify(data)));
        return fragment;
      }
      const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && value !== "");
      if (entries.length === 0) {
        fragment.appendChild(el("pre", "{}"));
        return fragment;
      }
      const grid = el("div", "", "grid");
      for (const [key, value] of entries) {
        grid.appendChild(el("div", key, "key"));
        grid.appendChild(el("div", typeof value === "object" ? stringify(value) : String(value), "value"));
      }
      fragment.appendChild(grid);
      return fragment;
    }

    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      node.textContent = text;
      return node;
    }

    function stringify(value) {
      return JSON.stringify(value, null, 2);
    }

    function statusText(event) {
      return event.statusCode === null ? "" : String(event.statusCode);
    }

    function formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
    }

    fetch("/events")
      .then((response) => response.json())
      .then((items) => {
        for (const event of items) {
          add(event, false);
        }
        selected = events.length - 1;
        renderList();
        renderDetail(events[selected]);
      });

    const socket = new WebSocket("ws://" + location.host + "/ws");
    socket.onmessage = (message) => {
      add(JSON.parse(message.data));
    };
  </script>
</body>
</html>`;

type PulseDb = {
  list(limit?: number): PulseEvent[];
};

export function startWeb(db: PulseDb, port: number) {
  const server = Bun.serve({
    port,
    fetch(req, live) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const ok = live.upgrade(req);
        if (ok) {
          return;
        }
        return new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/events") {
        return Response.json(db.list());
      }
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    },
    websocket: {
      open(ws) {
        ws.subscribe("logs");
      },
      message() {},
    },
  });

  return {
    port: server.port,
    publish(event: PulseEvent) {
      server.publish("logs", JSON.stringify(event));
    },
    stop() {
      server.stop(true);
    },
  };
}
