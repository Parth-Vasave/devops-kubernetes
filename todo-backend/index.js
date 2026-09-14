const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT;

// Connection settings come from the PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE env variables
const pool = new Pool();

const initDb = async () => {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS todos (id SERIAL PRIMARY KEY, content VARCHAR(140) NOT NULL)"
  );
};

// GET /todos - return all todos
app.get("/todos", async (req, res) => {
  const result = await pool.query("SELECT content FROM todos ORDER BY id");
  res.json(result.rows);
});

// POST /todos - create a new todo
app.post("/todos", async (req, res) => {
  const content = (req.body && req.body.content) ? req.body.content.trim() : "";

  if (!content) {
    return res.status(400).json({ error: "Todo content is required" });
  }
  if (content.length > 140) {
    return res.status(400).json({ error: "Todo must be 140 characters or fewer" });
  }

  const result = await pool.query(
    "INSERT INTO todos (content) VALUES ($1) RETURNING content",
    [content]
  );
  console.log(`Created todo: ${content}`);
  res.status(201).json(result.rows[0]);
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
