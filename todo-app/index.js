const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const IMAGE_DIR = "/app/files";
const IMAGE_PATH = path.join(IMAGE_DIR, "image.jpg");
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Serve files from the IMAGE_DIR (serves /app/files/image.jpg at /image.jpg)
app.use(express.static(IMAGE_DIR));

const downloadImage = (url, dest, redirectCount = 0) => {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) return reject(new Error("Too many redirects"));

    const lib = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);

    lib.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        file.close();
        fs.unlinkSync(dest);
        return downloadImage(response.headers.location, dest, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Unexpected status: ${response.statusCode}`));
      }

      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      try { fs.unlinkSync(dest); } catch (_) {}
      reject(err);
    });
  });
};

const isImageFresh = () => {
  if (!fs.existsSync(IMAGE_PATH)) return false;
  const stat = fs.statSync(IMAGE_PATH);
  return Date.now() - stat.mtimeMs < CACHE_DURATION_MS;
};

app.get("/", async (req, res) => {
  // Ensure the files directory exists
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  // Download a fresh image if the cached one is missing or stale
  if (!isImageFresh()) {
    try {
      await downloadImage("https://picsum.photos/1200", IMAGE_PATH);
      console.log("Downloaded new image from picsum.photos");
    } catch (err) {
      console.error("Failed to download image:", err.message);
    }
  } else {
    console.log("Serving cached image");
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Todo App</title>
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem;
            background: #f5f5f5;
          }
          h1 { font-size: 2rem; margin-bottom: 1rem; }
          img {
            max-width: 600px;
            width: 100%;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          }
          footer { margin-top: 1.5rem; color: #555; }
        </style>
      </head>
      <body>
        <h1>Todo App</h1>
        <img src="/image.jpg" alt="Daily picture" />
        <footer>DevOps with Kubernetes 2026</footer>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
