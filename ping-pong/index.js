const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

let counter = 0;

app.get("/pingpong", (req, res) => {
  res.send(`pong ${counter}`);
  counter++;
});

app.get("/pings", (req, res) => {
  res.send(counter.toString());
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
