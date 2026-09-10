const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Todo App</title>
      </head>
      <body>
        <h1>Todo App</h1>
        <p>Welcome to the Todo application.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
