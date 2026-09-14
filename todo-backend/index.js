const express = require("express");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT;
const MAX_TODO_LENGTH = 140;

// Log every request with its status code and duration
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startTime}ms`);
  });
  next();
});

app.use(express.json());

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
