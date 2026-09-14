const express = require("express");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT;

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
    "CREATE TABLE IF NOT EXISTS pingpong (id INTEGER PRIMARY KEY, counter INTEGER NOT NULL)"
  );
  await pool.query(
    "INSERT INTO pingpong (id, counter) VALUES (1, 0) ON CONFLICT (id) DO NOTHING"
  );
  dbInitialized = true;
};

// Load balancer health checks use this path so they do not increment the counter
app.get("/healthz", (req, res) => {
  res.send("ok");
});

// Readiness probe: the pod is ready only when the database answers a query
app.get("/readyz", async (req, res) => {
  if (!dbInitialized) {
    return res.status(503).send("database not initialized");
  }
  try {
    await pool.query("SELECT 1");
    res.send("ok");
  } catch (err) {
    console.error("Readiness check failed:", err.message);
    res.status(503).send("database unavailable");
  }
});

// The Gateway rewrites /pingpong to / before forwarding requests here
app.get("/", async (req, res) => {
  const result = await pool.query(
    "UPDATE pingpong SET counter = counter + 1 WHERE id = 1 RETURNING counter - 1 AS previous"
  );
  res.send(`pong ${result.rows[0].previous}`);
});

app.get("/pings", async (req, res) => {
  const result = await pool.query("SELECT counter FROM pingpong WHERE id = 1");
  res.send(result.rows[0].counter.toString());
});

// The server starts right away so the readiness probe can report the database state
app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
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
