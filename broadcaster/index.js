const http = require("http");
const { connect } = require("@nats-io/transport-node");

const PORT = process.env.PORT;
const NATS_URL = process.env.NATS_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const NATS_SUBJECT = "todos";
// All replicas join the same queue group, so NATS delivers each message to only one of them
const QUEUE_GROUP = "broadcaster";
const MAX_ATTEMPTS = 3;

let nats = null;
let natsConnected = false;

const formatMessage = ({ action, todo }) => {
  if (action === "created") {
    return `A todo was created: ${todo.content}`;
  }
  if (action === "updated") {
    return `A todo was marked as ${todo.done ? "done" : "not done"}: ${todo.content}`;
  }
  throw new Error(`unknown action "${action}"`);
};

const sendToDiscord = async (message) => {
  // Without a webhook (e.g. in branch environments) messages are only logged
  if (!DISCORD_WEBHOOK_URL) {
    console.log(`No Discord webhook configured, message not sent: ${message}`);
    return;
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // allowed_mentions stops todo content such as @everyone from pinging people
      body: JSON.stringify({ username: "bot", content: message, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10000),
    });
    // Discord did not accept a rate limited request, so retrying it cannot create a duplicate
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const { retry_after: retryAfter = 1 } = await response.json().catch(() => ({}));
      console.log(`Rate limited by Discord, retrying in ${retryAfter} seconds`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Discord responded with ${response.status}: ${await response.text()}`);
    }
    console.log(`Sent to Discord: ${message}`);
    return;
  }
};

// Liveness (/healthz) and readiness (/readyz, requires a NATS connection) probes
const server = http.createServer((req, res) => {
  const ready = req.url === "/healthz" || (req.url === "/readyz" && natsConnected);
  res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: ready ? "ok" : "not connected to NATS" }));
});

server.listen(PORT, () => {
  console.log(`Server started in port ${PORT}`);
});

const watchNatsStatus = async () => {
  for await (const status of nats.status()) {
    if (status.type === "disconnect" || status.type === "reconnect") {
      natsConnected = status.type === "reconnect";
      console.log(`NATS ${status.type}`);
    }
  }
};

const start = async () => {
  nats = await connect({ servers: NATS_URL, name: "broadcaster", waitOnFirstConnect: true, maxReconnectAttempts: -1 });
  natsConnected = true;
  console.log(`Connected to NATS at ${nats.getServer()}, subscribed to "${NATS_SUBJECT}" in queue group "${QUEUE_GROUP}"`);
  watchNatsStatus();

  const subscription = nats.subscribe(NATS_SUBJECT, { queue: QUEUE_GROUP });
  for await (const msg of subscription) {
    try {
      await sendToDiscord(formatMessage(msg.json()));
    } catch (err) {
      console.error(`Failed to forward message ${msg.string()}:`, err.message);
    }
  }
};

start().catch((err) => {
  console.error("Broadcaster stopped:", err);
  process.exit(1);
});

// Draining stops new deliveries and finishes the messages already received, so scaling down loses nothing
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, draining the NATS subscription");
  natsConnected = false;
  if (nats && !nats.isClosed()) {
    await nats.drain();
  }
  server.close(() => process.exit(0));
});
