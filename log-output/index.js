const fs = require("fs");
const http = require("http");
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const logPath = "/shared-data/log.txt";
const PING_PONG_URL = "http://ping-pong:3000/pings";

const fetchPings = () => {
  return new Promise((resolve) => {
    http.get(PING_PONG_URL, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data.trim()));
    }).on("error", (err) => {
      console.error("Failed to fetch pings:", err.message);
      resolve("unavailable");
    });
  });
};

app.get("/", async (req, res) => {
  try {
    const logContent = fs.readFileSync(logPath, "utf8");
    const lines = logContent.trim().split("\n");
    const lastLog = lines[lines.length - 1];

    const [timestamp, randomString] = lastLog.split(" ");
    const formattedLog = `${timestamp}: ${randomString}.`;

    const pings = await fetchPings();

    res.send(`${formattedLog}\nPing / Pongs: ${pings}\n`);
  } catch (error) {
    res.status(500).send("Log file not available yet");
  }
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
