import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Readable } from "stream";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/image-proxy", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";

    if (!rawUrl) {
      res.status(400).json({ error: "Missing image URL." });
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: "Invalid image URL." });
      return;
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      res.status(400).json({ error: "Unsupported image protocol." });
      return;
    }

    try {
      const upstream = await fetch(targetUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: {
          "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "referer": `${targetUrl.origin}/`,
        },
      });

      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "Image host rejected the request." });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      if (contentType.includes("text/html")) {
        res.status(415).json({ error: "Remote URL did not return an image." });
        return;
      }

      const cacheControl = upstream.headers.get("cache-control");
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      } else {
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      }

      const contentLength = upstream.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      res.setHeader("Content-Type", contentType);
      const etag = upstream.headers.get("etag");
      if (etag) {
        res.setHeader("ETag", etag);
      }
      const lastModified = upstream.headers.get("last-modified");
      if (lastModified) {
        res.setHeader("Last-Modified", lastModified);
      }

      if (!upstream.body) {
        res.status(502).json({ error: "Unable to stream remote image." });
        return;
      }

      const bodyStream = Readable.fromWeb(upstream.body as any);
      bodyStream.on("error", (error) => {
        console.error("Image proxy stream failed:", error);
        if (!res.headersSent) {
          res.status(502).json({ error: "Unable to stream remote image." });
        } else {
          res.destroy(error as Error);
        }
      });
      bodyStream.pipe(res);
    } catch (error) {
      console.error("Image proxy failed:", error);
      res.status(502).json({ error: "Unable to load remote image." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
