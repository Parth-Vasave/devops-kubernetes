const express = require("express");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const filePath = "/shared-data/pingpong.txt";

let counter = 0;
if (fs.existsSync(filePath)) {
  const data = fs.readFileSync(filePath, "utf8");
  counter = parseInt(data) || 0;
}

app.get("/pingpong", (req, res) => {
  res.send(`pong ${counter}`);
  counter++;
  fs.writeFileSync(filePath, counter.toString(), "utf8");
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
