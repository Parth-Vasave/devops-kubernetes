const express = require("express");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT;

// Connection settings come from the PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE env variables
const pool = new Pool();

const initDb = async () => {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS pingpong (id INTEGER PRIMARY KEY, counter INTEGER NOT NULL)"
  );
  await pool.query(
    "INSERT INTO pingpong (id, counter) VALUES (1, 0) ON CONFLICT (id) DO NOTHING"
  );
};

// Load balancer health checks use this path so they do not increment the counter
app.get("/healthz", (req, res) => {
  res.send("ok");
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

const start = async () => {
  // Wait until the database accepts connections before serving requests
  while (true) {
    try {
      await initDb();
      break;
    } catch (err) {
      console.error("Database not ready, retrying in 5 seconds:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  app.listen(PORT, () => {
    console.log(`Server started in port ${PORT}`);
  });
};

start();
