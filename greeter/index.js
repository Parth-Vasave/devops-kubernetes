const http = require("http");

const PORT = process.env.PORT || 3000;
const VERSION = process.env.VERSION || "1";

// Answers every GET request with a greeting that tells which version responded
const server = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`Hello from version ${VERSION}`);
});

server.listen(PORT, () => {
  console.log(`Greeter version ${VERSION} started in port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
