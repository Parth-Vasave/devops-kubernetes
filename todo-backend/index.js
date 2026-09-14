const express = require("express");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT;
const MAX_TODO_LENGTH = 140;

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

const initDb = async () => {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS todos (id SERIAL PRIMARY KEY, content VARCHAR(140) NOT NULL)"
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
  const result = await pool.query("SELECT content FROM todos ORDER BY id");
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
    "INSERT INTO todos (content) VALUES ($1) RETURNING content",
    [content]
  );
  console.log(`Created todo: ${content}`);
  res.status(201).json(result.rows[0]);
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
