const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT;
const IMAGE_DIR = "/app/files";
const IMAGE_PATH = path.join(IMAGE_DIR, "image.jpg");
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const TODO_BACKEND_URL = process.env.TODO_BACKEND_URL;

// Set to false by the "break the app" button; the liveness probe then fails and Kubernetes restarts the container
let isHealthy = true;

const checkBackendReady = () => {
  return new Promise((resolve) => {
    const request = http.get(`${TODO_BACKEND_URL}/readyz`, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    request.on("timeout", () => request.destroy(new Error("timed out")));
    request.on("error", (err) => {
      console.error("Backend readiness check failed:", err.message);
      resolve(false);
    });
  });
};

// Liveness probe and load balancer health check: fails once the app has been broken
app.get("/healthz", (req, res) => {
  if (!isHealthy) {
    return res.status(500).json({ status: "unhealthy" });
  }
  res.json({ status: "ok" });
});

// Readiness probe: the app is ready when it is healthy and the backend is connected to the database
app.get("/readyz", async (req, res) => {
  if (!isHealthy) {
    return res.status(503).json({ status: "unhealthy" });
  }
  if (!(await checkBackendReady())) {
    return res.status(503).json({ status: "backend not ready" });
  }
  res.json({ status: "ok" });
});

// Once broken, every page shows the failure message until the container is restarted
app.use((req, res, next) => {
  if (isHealthy) {
    return next();
  }
  res.status(500).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>System Failure</title>
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            padding: 2rem 1rem;
            margin: 0;
            background: #fff5f5;
          }
          .failure {
            width: 100%;
            max-width: 640px;
            padding: 1.5rem 2rem;
            text-align: center;
            color: #8b1e1e;
            background: #ffe5e5;
            border: 1px solid #e0b4b4;
            border-radius: 8px;
          }
          h1 { font-size: 2rem; margin: 0 0 1rem; }
          p { font-size: 1.1rem; margin: 0; }
        </style>
      </head>
      <body>
        <div class="failure">
          <h1>System Failure</h1>
          <p>The Todo App is currently unhealthy. Please wait for recovery.</p>
        </div>
      </body>
    </html>
  `);
});

// Serve cached image file
app.use(express.static(IMAGE_DIR));

const downloadImage = (url, dest, redirectCount = 0) => {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) return reject(new Error("Too many redirects"));

    const lib = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);

    lib.get(url, (response) => {
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

const fetchTodos = () => {
  return new Promise((resolve) => {
    http.get(`${TODO_BACKEND_URL}/todos`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve([]); }
      });
    }).on("error", (err) => {
      console.error("Failed to fetch todos:", err.message);
      resolve([]);
    });
  });
};

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

// Sends a JSON request to todo-backend and resolves with its status code and response body
const sendToBackend = (method, path, payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = http.request(`${TODO_BACKEND_URL}${path}`, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

// POST /todos — accept form submission, forward to todo-backend, redirect back
app.post("/todos", async (req, res) => {
  const content = (req.body && req.body.content) ? req.body.content.trim() : "";
  if (content) {
    try {
      await sendToBackend("POST", "/todos", { content });
    } catch (err) {
      console.error("Failed to post todo:", err.message);
    }
  }
  res.redirect("/");
});

// PUT /todos/:id — forward the update (e.g. { "done": true }) to todo-backend
app.put("/todos/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: "Todo id must be a positive integer" });
  }
  try {
    const result = await sendToBackend("PUT", `/todos/${req.params.id}`, { done: req.body?.done });
    res.status(result.status).type("application/json").send(result.body);
  } catch (err) {
    console.error("Failed to update todo:", err.message);
    res.status(502).json({ error: "Todo backend unavailable" });
  }
});

// POST /break — make the app unhealthy on purpose
app.post("/break", (req, res) => {
  isHealthy = false;
  console.log("The app was broken on purpose; health checks now fail");
  res.redirect("/");
});

app.get("/", async (req, res) => {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  if (!isImageFresh()) {
    try {
      await downloadImage(process.env.IMAGE_URL, IMAGE_PATH);
      console.log("Downloaded new image from picsum.photos");
    } catch (err) {
      console.error("Failed to download image:", err.message);
    }
  }

  const todos = await fetchTodos();
  const todoItems = todos
    .map((t) => t.done
      ? `<li class="todo-item done">
          <span class="todo-content">${escapeHtml(t.content)}</span>
          <span class="done-label">Done</span>
        </li>`
      : `<li class="todo-item">
          <span class="todo-content">${escapeHtml(t.content)}</span>
          <button class="done-btn" type="button" data-id="${t.id}">Mark done</button>
        </li>`)
    .join("\n");

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Todo App</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem 1rem;
            background: #fff;
            color: #222;
          }
          h1 { font-size: 2rem; font-weight: bold; margin-bottom: 1.5rem; }
          img {
            width: 260px;
            height: 260px;
            object-fit: cover;
            border-radius: 8px;
            margin-bottom: 2rem;
          }
          .input-row {
            display: flex;
            gap: 0.5rem;
            width: 100%;
            max-width: 640px;
            margin-bottom: 0.5rem;
          }
          #todo-input {
            flex: 1;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            border: 2px solid #4caf50;
            border-radius: 4px;
            outline: none;
          }
          #todo-input:focus { border-color: #388e3c; }
          #send-btn {
            padding: 0.75rem 1.5rem;
            font-size: 1rem;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }
          #send-btn:hover { background: #388e3c; }
          #char-count {
            font-size: 0.8rem;
            color: #999;
            align-self: flex-start;
            margin-bottom: 1.5rem;
          }
          #char-count.over { color: #e53935; }
          h2 { font-size: 1.4rem; font-weight: bold; margin-bottom: 1rem; }
          .todo-list { list-style: none; width: 100%; max-width: 640px; }
          .todo-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1rem;
            border-bottom: 1px solid #e0e0e0;
            border-left: 4px solid #4caf50;
            background: #fafafa;
            font-size: 1rem;
          }
          .todo-item:last-child { border-bottom: none; }
          .todo-content { overflow-wrap: anywhere; }
          .todo-item.done { border-left-color: #9e9e9e; background: #f0f0f0; }
          .todo-item.done .todo-content { color: #757575; text-decoration: line-through; }
          .done-label { color: #2e7d32; font-weight: bold; white-space: nowrap; }
          .done-btn {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            white-space: nowrap;
          }
          .done-btn:hover { background: #1565c0; }
          .done-btn:disabled { background: #90a4ae; cursor: default; }
          footer { margin-top: 2rem; color: #757575; }
          .break-form { margin-top: 2rem; }
          #break-btn {
            padding: 0.6rem 1.2rem;
            font-size: 1rem;
            background: #e53935;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          #break-btn:hover { background: #c62828; }
        </style>
      </head>
      <body>
        <h1>Todo App</h1>
        <img src="/image.jpg" alt="Daily picture" />

        <form class="input-row" action="/todos" method="POST">
          <input
            id="todo-input"
            name="content"
            type="text"
            maxlength="140"
            placeholder="Enter a new todo (max 140 characters)"
            autocomplete="off"
          />
          <button id="send-btn" type="submit">Send</button>
        </form>
        <span id="char-count">0 / 140</span>

        <h2>Todos</h2>
        <ul class="todo-list">
          ${todoItems}
        </ul>

        <form class="break-form" action="/break" method="POST">
          <button id="break-btn" type="submit">break the app</button>
        </form>

        <footer>DevOps with Kubernetes ${new Date().getFullYear()}</footer>

        <script>
          const input = document.getElementById('todo-input');
          const counter = document.getElementById('char-count');
          input.addEventListener('input', () => {
            const len = input.value.length;
            counter.textContent = len + ' / 140';
            counter.className = len > 140 ? 'over' : '';
          });

          // HTML forms cannot send PUT, so the Mark done buttons use fetch
          document.querySelectorAll('.done-btn').forEach((button) => {
            button.addEventListener('click', async () => {
              button.disabled = true;
              try {
                const response = await fetch('/todos/' + button.dataset.id, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ done: true }),
                });
                if (!response.ok) throw new Error('status ' + response.status);
                location.reload();
              } catch (err) {
                button.disabled = false;
                alert('Could not mark the todo as done (' + err.message + ')');
              }
            });
          });
        </script>
      </body>
    </html>
  `);
});

const server = app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});

// Node ignores SIGTERM when it runs as PID 1, so without this Kubernetes waits 30 seconds before killing the container
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down");
  server.close(() => process.exit(0));
});
