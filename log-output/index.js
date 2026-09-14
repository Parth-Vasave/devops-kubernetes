const fs = require("fs");
const http = require("http");
const express = require("express");

const app = express();

const PORT = process.env.PORT;
const logPath = "/shared-data/log.txt";
const configPath = "/etc/config/information.txt";
const PING_PONG_URL = process.env.PING_PONG_URL;

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

// Readiness probe: the pod is ready only when Ping-pong answers with the ping count
app.get("/readyz", (req, res) => {
  const request = http.get(PING_PONG_URL, { timeout: 2000 }, (pingRes) => {
    pingRes.resume();
    if (pingRes.statusCode === 200) {
      res.send("ok");
    } else {
      res.status(503).send(`ping-pong responded with ${pingRes.statusCode}`);
    }
  });
  request.on("timeout", () => request.destroy(new Error("timed out")));
  request.on("error", (err) => {
    res.status(503).send(`ping-pong unavailable: ${err.message}`);
  });
});

app.get("/", async (req, res) => {
  try {
    const logContent = fs.readFileSync(logPath, "utf8");
    const lines = logContent.trim().split("\n");
    const lastLog = lines[lines.length - 1];

    const [timestamp, randomString] = lastLog.split(" ");
    const formattedLog = `${timestamp}: ${randomString}.`;

    const fileContent = fs.readFileSync(configPath, "utf8").trim();
    const message = process.env.MESSAGE;

    const pings = await fetchPings();

    // Plain text keeps the line breaks when the page is opened in a browser
    res.type("text/plain").send(
      `file content: ${fileContent}\n` +
      `env variable: MESSAGE=${message}\n` +
      `${formattedLog}\n` +
      `Ping / Pongs: ${pings}\n`
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Required file or log file not available yet");
  }
});

app.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});
