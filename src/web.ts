import type { PulseEvent } from "./protocol";

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>pulse-listen</title>
  <style>
    body { margin: 0; background: #101114; color: #e8e8ea; font: 13px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    #list { padding: 16px; }
    .row { border-bottom: 1px solid #23252b; padding: 8px 0; white-space: pre-wrap; word-break: break-word; }
    .kind { color: #7dd3fc; }
    .message { color: #f5f5f5; }
    .meta { color: #a1a1aa; }
  </style>
</head>
<body>
  <div id="list"></div>
  <script>
    const list = document.getElementById("list");

    function add(event) {
      const row = document.createElement("div");
      row.className = "row";

      let text = event.createdAt + " ";
      text += event.kind + " ";

      if (event.kind === "message") {
        if (event.level) {
          text += event.level + " ";
        }
        if (event.message) {
          text += event.message;
        }
      } else {
        if (event.method) {
          text += event.method + " ";
        }
        if (event.url) {
          text += event.url;
        }
        if (event.statusCode !== null) {
          text += " " + event.statusCode;
        }
        if (event.error) {
          text += " " + event.error;
        }
      }

      row.textContent = text;
      list.appendChild(row);

      while (list.childNodes.length > 500) {
        list.removeChild(list.firstChild);
      }

      window.scrollTo(0, document.body.scrollHeight);
    }

    fetch("/events")
      .then((response) => response.json())
      .then((events) => {
        for (const event of events) {
          add(event);
        }
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

export function startWeb(db: PulseDb) {
  const server = Bun.serve({
    port: 0,
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
