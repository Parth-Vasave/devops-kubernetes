# Broadcaster

Exercise 4.6 – DevOps with Kubernetes.

Forwards status messages about todos to Discord.

```
todo-backend ──publish "todos"──▶ NATS ──queue group "broadcaster"──▶ broadcaster (6 replicas) ──webhook──▶ Discord
```

1. When a todo is created or updated, todo-backend publishes `{ "action": "created" | "updated", "todo": { "id", "content", "done" } }` to the `todos` subject.
2. Every broadcaster replica subscribes to `todos` in the same **queue group**. NATS delivers each message to exactly one member of a queue group, so the broadcaster can be scaled without sending a message more than once.
3. The replica that receives the message posts it to the Discord webhook in Discord's format:

   ```json
   { "username": "bot", "content": "A todo was marked as done: Learn Kubernetes basics", "allowed_mentions": { "parse": [] } }
   ```

   `allowed_mentions` stops todo content such as `@everyone` from pinging people.

Delivery is at most once. A message that fails to send is logged and dropped, which the exercise allows, so a failure can never cause a duplicate. The one exception is a rate-limited request (HTTP 429): Discord did not accept it, so it is retried after `retry_after`, up to 3 attempts. On `SIGTERM` the NATS connection is drained, so a replica that is scaled down finishes the messages it already received and receives no new ones.

## Configuration

| Variable | Description |
| --- | --- |
| `PORT` | Port for the `/healthz` (liveness) and `/readyz` (ready when connected to NATS) probes |
| `NATS_URL` | NATS server, `nats://nats:4222` |
| `DISCORD_WEBHOOK_URL` | Discord webhook. If it is not set, messages are only logged |

The webhook URL is stored in `manifests/secret.enc.yaml`, encrypted with SOPS. The deploy workflow applies it only to the main (`project`) environment, so branch environments run the broadcaster without posting to Discord.

## Kubernetes

`manifests/` contains:

- `nats.yaml`: a single NATS server (`nats:2.14.6`) with a Service, one per environment. Core NATS without JetStream keeps no state, so a Deployment is enough.
- `deployment.yaml`: the broadcaster with 6 replicas.

Both are included in `project/kustomization.yaml` and deployed by the GitHub Actions workflow, which also builds the broadcaster image.

## Tests

**Discord (main environment, 6 replicas):** 3 todos created in parallel through the Gateway, then marked done in parallel. Each of the 6 messages was sent once, by 4 different replicas:

```
qssfm Sent to Discord: A todo was created: Broadcaster test 1
sbpfm Sent to Discord: A todo was created: Broadcaster test 2
wr6bp Sent to Discord: A todo was created: Broadcaster test 3
xklcb Sent to Discord: A todo was marked as done: Broadcaster test 2
sbpfm Sent to Discord: A todo was marked as done: Broadcaster test 1
wr6bp Sent to Discord: A todo was marked as done: Broadcaster test 3
```

**Load test on GKE (6 replicas, scaled to 3 during the test):** to avoid flooding the Discord channel, this ran in a temporary namespace with its own NATS and the same broadcaster image without a webhook, so messages were only logged. A `nats-box` pod published 300 messages in 6.4 seconds, and the Deployment was scaled from 6 to 3 replicas after 3 seconds:

```
9g5km: 34 messages, stopped by scale-down
9xbzf: 76 messages, running
jnqtw: 64 messages, running
mc5bn: 20 messages, stopped by scale-down
pjn88: 30 messages, stopped by scale-down
tmjrw: 76 messages, running
total handled: 300 of 300, unique: 300, duplicates: 0
```

**Locally:** 6 broadcasters against a mock webhook that recorded every request received 30 parallel creates and 20 parallel updates exactly once each, and 40 messages exactly once while 3 of the 6 replicas were stopped with `SIGTERM` during the burst.

## Run locally

```bash
docker run -p 4222:4222 nats:2.14.6
npm install
PORT=3000 NATS_URL=nats://localhost:4222 DISCORD_WEBHOOK_URL=<webhook> node index.js
```
