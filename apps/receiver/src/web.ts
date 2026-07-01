import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { PulseEvent } from "./protocol";

type PulseDb = {
  list(limit?: number): PulseEvent[];
};

type WebAsset = {
  body: Blob;
  type: string;
};

export async function startWeb(db: PulseDb, port: number) {
  const assets = await buildWebAssets();
  const page = getPage(assets);

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

      const asset = assets.get(url.pathname);
      if (asset) {
        return new Response(asset.body, {
          headers: {
            "cache-control": "no-cache",
            "content-type": asset.type,
          },
        });
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

async function buildWebAssets() {
  const entrypoint = fileURLToPath(new URL("../../web/src/main.tsx", import.meta.url));
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
  });

  if (!result.success) {
    throw new Error(`web build failed:\n${result.logs.map((log) => log.message).join("\n")}`);
  }

  const assets = new Map<string, WebAsset>();
  for (const output of result.outputs) {
    assets.set(`/assets/${basename(output.path)}`, {
      body: output,
      type: output.type,
    });
  }
  return assets;
}

function getPage(assets: Map<string, WebAsset>) {
  const scripts = [...assets.keys()].filter((path) => path.endsWith(".js"));
  const styles = [...assets.keys()].filter((path) => path.endsWith(".css"));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>pulse-viewer</title>
  ${styles.map((path) => `<link rel="stylesheet" href="${path}">`).join("\n  ")}
</head>
<body>
  <div id="root"></div>
  ${scripts.map((path) => `<script type="module" src="${path}"></script>`).join("\n  ")}
</body>
</html>`;
}
