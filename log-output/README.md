# Log Output

Exercise 2.1 – DevOps with Kubernetes.

## Description

The Log Output application is split into two containers running in the same Kubernetes Pod.

- **Generator container:** generates a random string on startup and writes the current timestamp and random string to `/shared-data/log.txt` every 5 seconds (shared via an `emptyDir` volume within the pod).
- **Log Output container:** on every `GET /`, reads the latest log line and fetches the current ping count from the Ping-Pong service via `GET http://ping-pong:3000/pings`.

The two pods communicate over HTTP inside the cluster — no shared volume between them.

## Run Locally

Build the image:

```bash
docker build -t parthvasave/log-output:1.11 .
```
