const express = require("express");
const { Pool } = require("pg");
const { connect } = require("@nats-io/transport-node");

const app = express();

const PORT = process.env.PORT;
const MAX_TODO_LENGTH = 140;
const NATS_URL = process.env.NATS_URL;
const NATS_SUBJECT = "todos";

const PROBE_PATHS = ["/healthz", "/readyz"];

// Log every request with its status code and duration (probe requests every few seconds are left out)
app.use((req, res, next) => {
  if (PROBE_PATHS.includes(req.path)) {
    return next();
  }
  const startTime = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startTime}ms`);
  });
  next();
});

app.use(express.json());

// Connection settings come from the PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE env variables
// Connection attempts time out so readiness checks fail quickly while the database is unreachable
const pool = new Pool({ connectionTimeoutMillis: 2000 });

// Idle connections break when the database restarts; without a handler the error would crash the app
pool.on("error", (err) => {
  console.error("Lost an idle database connection:", err.message);
});

let dbInitialized = false;
let nats = null;

// Status messages are best effort: a todo is still saved if NATS is unavailable
const publishTodoEvent = (action, todo) => {
  if (!nats || nats.isClosed()) {
    console.error(`NATS is not connected, the ${action} message for todo ${todo.id} was not sent`);
    return;
  }
  nats.publish(NATS_SUBJECT, JSON.stringify({ action, todo }));
};

const initDb = async () => {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS todos (id SERIAL PRIMARY KEY, content VARCHAR(140) NOT NULL)"
  );
  // Databases created before Exercise 4.5 do not have the done column yet
  await pool.query(
    "ALTER TABLE todos ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false"
  );
  dbInitialized = true;
};

// Liveness probe: the server is running and answering requests
app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

// Readiness probe: the backend is ready only when the database answers a query
app.get("/readyz", async (req, res) => {
  if (!dbInitialized) {
    return res.status(503).json({ status: "database not initialized" });
  }
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Readiness check failed:", err.message);
    res.status(503).json({ status: "database unavailable" });
  }
});

// GET /todos - return all todos
app.get("/todos", async (req, res) => {
  const result = await pool.query("SELECT id, content, done FROM todos ORDER BY id");
  res.json(result.rows);
});

// POST /todos - create a new todo
app.post("/todos", async (req, res) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  console.log(`Received todo (${content.length} characters): ${content}`);

  if (!content) {
    console.log("Rejected todo: content is empty");
    return res.status(400).json({ error: "Todo content is required" });
  }
  if (content.length > MAX_TODO_LENGTH) {
    console.log(`Rejected todo: ${content.length} characters exceeds the ${MAX_TODO_LENGTH} character limit: ${content}`);
    return res.status(400).json({ error: `Todo must be ${MAX_TODO_LENGTH} characters or fewer` });
  }

  const result = await pool.query(
    "INSERT INTO todos (content) VALUES ($1) RETURNING id, content, done",
    [content]
  );
  console.log(`Created todo: ${content}`);
  publishTodoEvent("created", result.rows[0]);
  res.status(201).json(result.rows[0]);
});

// PUT /todos/:id - update whether a todo is done
app.put("/todos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Todo id must be a positive integer" });
  }
  if (typeof req.body?.done !== "boolean") {
    return res.status(400).json({ error: "done must be true or false" });
  }

  const result = await pool.query(
    "UPDATE todos SET done = $1 WHERE id = $2 RETURNING id, content, done",
    [req.body.done, id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Todo not found" });
  }
  console.log(`Marked todo ${id} as ${req.body.done ? "done" : "not done"}: ${result.rows[0].content}`);
  publishTodoEvent("updated", result.rows[0]);
  res.json(result.rows[0]);
});

// The server starts right away so the probes can report the database state
const server = app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});

// Node ignores SIGTERM when it runs as PID 1, so without this Kubernetes waits 30 seconds before killing the container
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down");
  server.close(() => process.exit(0));
});

const connectDb = async () => {
  while (true) {
    try {
      await initDb();
      console.log("Connected to the database");
      break;
    } catch (err) {
      console.error("Database not ready, retrying in 5 seconds:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

connectDb();

// Keeps trying to connect, and reconnects automatically if the connection is lost
const connectNats = async () => {
  try {
    nats = await connect({ servers: NATS_URL, name: "todo-backend", waitOnFirstConnect: true, maxReconnectAttempts: -1 });
    console.log(`Connected to NATS at ${nats.getServer()}`);
  } catch (err) {
    console.error("Failed to connect to NATS:", err.message);
  }
};

connectNats();
