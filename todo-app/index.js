const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const IMAGE_DIR = "/app/files";
const IMAGE_PATH = path.join(IMAGE_DIR, "image.jpg");
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const TODO_BACKEND_URL = "http://todo-backend:3000";

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

const postTodo = (content) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ content });
    const options = {
      hostname: "todo-backend",
      port: 3000,
      path: "/todos",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
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
      await postTodo(content);
    } catch (err) {
      console.error("Failed to post todo:", err.message);
    }
  }
  res.redirect("/");
});

app.get("/", async (req, res) => {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  if (!isImageFresh()) {
    try {
      await downloadImage("https://picsum.photos/1200", IMAGE_PATH);
      console.log("Downloaded new image from picsum.photos");
    } catch (err) {
      console.error("Failed to download image:", err.message);
    }
  }

  const todos = await fetchTodos();
  const todoItems = todos
    .map((t) => `<li class="todo-item">${t.content}</li>`)
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
            padding: 1rem;
            border-bottom: 1px solid #e0e0e0;
            border-left: 4px solid #4caf50;
            background: #fafafa;
            font-size: 1rem;
          }
          .todo-item:last-child { border-bottom: none; }
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

        <script>
          const input = document.getElementById('todo-input');
          const counter = document.getElementById('char-count');
          input.addEventListener('input', () => {
            const len = input.value.length;
            counter.textContent = len + ' / 140';
            counter.className = len > 140 ? 'over' : '';
          });
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
