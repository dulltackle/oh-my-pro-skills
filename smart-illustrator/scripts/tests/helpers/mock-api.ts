import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x1x8AAAAASUVORK5CYII=";

export interface CapturedRequest {
  method?: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
}

export interface MockApiServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

export async function startMockApiServer(): Promise<MockApiServer> {
  const requests: CapturedRequest[] = [];
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf-8") || "{}";
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { raw };
      }
      requests.push({
        method: req.method,
        path: req.url || "/",
        headers: req.headers,
        body,
      });

      if ((req.url || "").includes("/images/generations")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [{ b64_json: PNG_BASE64 }],
            output_format: "png",
          }),
        );
        return;
      }

      if ((req.url || "").includes("/images/edits")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [{ b64_json: PNG_BASE64 }],
            output_format: "png",
          }),
        );
        return;
      }

      if ((req.url || "").includes("/chat/completions")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    {
                      type: "image_url",
                      image_url: { url: `data:image/png;base64,${PNG_BASE64}` },
                    },
                  ],
                },
              },
            ],
          }),
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: "image/png", data: PNG_BASE64 } },
                ],
              },
            },
          ],
        }),
      );
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to get mock server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

export async function startFlakyApiServer(
  failuresBeforeSuccess = 1,
): Promise<MockApiServer> {
  const requests: CapturedRequest[] = [];
  let requestCount = 0;
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf-8") || "{}";
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { raw };
      }
      requests.push({
        method: req.method,
        path: req.url || "/",
        headers: req.headers,
        body,
      });

      requestCount += 1;
      if (requestCount <= failuresBeforeSuccess) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "temporary provider failure" },
          }),
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: "image/png", data: PNG_BASE64 } },
                ],
              },
            },
          ],
        }),
      );
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to get mock server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}
