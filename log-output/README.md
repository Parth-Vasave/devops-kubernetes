# Log Output

Exercise 2.1 – DevOps with Kubernetes.

## Description

The Log Output application is split into two containers running in the same Kubernetes Pod.

- **Generator container:** generates a random string on startup and writes the current timestamp and random string to `/shared-data/log.txt` every 5 seconds (shared via an `emptyDir` volume within the pod).
- **Log Output container:** on every `GET /`, reads the latest log line and fetches the current ping count from the Ping-Pong service via `GET http://ping-pong:3000/pings`.

The two pods communicate over HTTP inside the cluster — no shared volume between them.

## Readiness probes (Exercise 4.1)

Both applications have a readinessProbe on a `/readyz` endpoint, so Kubernetes only sends them traffic when their dependencies work:

- **Ping-pong** (`ping-pong/index.js`) is ready when it can query the database. It starts its HTTP server right away and keeps retrying the database connection in the background; `/readyz` returns 503 until the table is created and `SELECT 1` succeeds.
- **Log output** (`index.js`) is ready when `GET http://ping-pong:3000/pings` returns 200. Only the `log-output` container has the probe, so the pod shows `1/2` while the generator container is ready on its own.

A service does not route traffic to a pod that is not ready. While Ping-pong is not ready its service has no endpoints, so Log output's check fails too.

Ping-pong also handles errors from idle database connections. Before this fix, restarting the database crashed the app.

### Test

Apply everything except the database StatefulSet (since Exercise 4.4 Ping-pong is an Argo Rollouts `Rollout`, see `ping-pong/README.md`):

```bash
kubectl apply -f kubernetes/namespace.yaml -f log-output/manifests/configmap.yaml
sops --decrypt ping-pong/manifests/secret.enc.yaml | kubectl apply -f -
kubectl apply -f log-output/manifests/ -f ping-pong/manifests/rollout.yaml -f ping-pong/manifests/analysistemplate.yaml -f ping-pong/manifests/healthcheck.yaml
```

```
$ kubectl -n exercises get po
NAME                         READY   STATUS    RESTARTS   AGE
log-output-b45cbd76b-8jv2p   1/2     Running   0          46s
ping-pong-5f787dffc4-ckbpf   0/1     Running   0          46s
```

Adding the database makes both pods ready without restarts (here 20 seconds after applying):

```bash
kubectl apply -f ping-pong/manifests/postgres.yaml
```

```
$ kubectl -n exercises get po
NAME                         READY   STATUS    RESTARTS   AGE
log-output-b45cbd76b-8jv2p   2/2     Running   0          87s
ping-pong-5f787dffc4-ckbpf   1/1     Running   0          87s
postgres-ss-0                1/1     Running   0          20s
```

If the database pod is deleted, both pods become not ready until the database is back, and none of them restart.

## Run Locally

Build the image:

```bash
docker build -t parthvasave/log-output:1.11 .
```
