# Log output with a serverless Ping-pong

Exercise 5.7 – DevOps with Kubernetes. Ping-pong runs as a Knative Service on the k3d cluster with Knative Serving, Kourier and sslip.io from [Exercise 5.6](../knative/README.md).

## Setup

| File | What |
| --- | --- |
| `pingpong.yaml` | Ping-pong (`parthvasave/ping-pong:5.3`) as a Knative `Service` |
| `log-output.yaml` | Log output as a normal Deployment, exposed on NodePort 30080 (`localhost:8082` via the k3d port mapping) |
| `postgres.yaml` | PostgreSQL StatefulSet for the ping counter |

- **Knative manages Ping-pong.** Knative creates a revision, a route and the autoscaler. The app already listens on the `PORT` environment variable, which Knative sets to 8080, so the image is unchanged. `/readyz` is used as the readiness probe, so Knative only sends traffic to a pod that is connected to the database.
- **Fully qualified names.** Log output calls Ping-pong at `http://pingpong.exercises.svc.cluster.local/pings` and Ping-pong connects to `psql-svc.exercises.svc.cluster.local`, as the exercise recommends. `pingpong.exercises.svc.cluster.local` is an ExternalName service created by Knative that points to Kourier's internal gateway, which starts a Ping-pong pod if none is running.
- **No readiness dependency on Ping-pong.** In earlier exercises Log output's readiness probe called Ping-pong. With a serverless Ping-pong, a probe every 5 seconds would keep Ping-pong running forever, so here Log output's readiness probe only checks its TCP port.

```bash
kubectl apply -f serverless/namespace.yaml
sops --decrypt ping-pong/manifests/secret.enc.yaml | kubectl apply -f -
kubectl apply -k serverless
kubectl -n exercises get ksvc pingpong   # URL http://pingpong.exercises.172.19.0.3.sslip.io
```

Ping-pong is reached from the host through Kourier with its sslip.io host name in the `Host` header (the sslip.io address itself is a Docker network IP that the Mac cannot reach), and Log output on port 8082.

## Test

```
$ curl -H "Host: pingpong.exercises.172.19.0.3.sslip.io" http://localhost:8081/   # Ping-pong through Kourier
pong 0
pong 1
pong 2
$ curl http://localhost:8082/   # Log output
file content: this text is from file
env variable: MESSAGE=hello world
2026-09-14T19:52:46.685Z: 84fff003ee35eb6f.
Ping / Pongs: 3
# 363s later, without requests, Ping-pong has scaled to zero
$ kubectl -n exercises get pods
NAME                         READY   STATUS    RESTARTS   AGE
log-output-89df9d8c7-gdbv2   2/2     Running   0          7m11s
postgres-0                   1/1     Running   0          7m11s
$ curl http://localhost:8082/   # Log output calls Ping-pong, which starts again
file content: this text is from file
env variable: MESSAGE=hello world
2026-09-14T19:58:47.199Z: 84fff003ee35eb6f.
Ping / Pongs: 3
(response in 1.9 s)
$ kubectl -n exercises get pods
NAME                                        READY   STATUS    RESTARTS   AGE
log-output-89df9d8c7-gdbv2                  2/2     Running   0          7m13s
pingpong-00001-deployment-655c6bc8d-b24rm   2/2     Running   0          2s
postgres-0                                  1/1     Running   0          7m13s
```

Ping-pong answered through Kourier and Log output showed the count. When it received no requests, Knative scaled Ping-pong to zero while Log output and PostgreSQL kept running. The next request to Log output started a new Ping-pong pod and still returned the count from the database, with a response time of 1.9 seconds including the cold start.
