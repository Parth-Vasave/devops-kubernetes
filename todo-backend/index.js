const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let todos = [];

// GET /todos - return all todos
app.get("/todos", (req, res) => {
  res.json(todos);
});

// POST /todos - create a new todo
app.post("/todos", (req, res) => {
  const content = (req.body && req.body.content) ? req.body.content.trim() : "";

  if (!content) {
    return res.status(400).json({ error: "Todo content is required" });
  }
  if (content.length > 140) {
    return res.status(400).json({ error: "Todo must be 140 characters or fewer" });
  }

  const todo = { content };
  todos.push(todo);
  console.log(`Created todo: ${content}`);
  res.status(201).json(todo);
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
