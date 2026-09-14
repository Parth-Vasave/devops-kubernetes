# Ping-pong

Counts requests to `/` and stores the counter in PostgreSQL. `GET /pings` returns the current count, which Log output displays.

## Canary updates (Exercise 4.4)

Ping-pong is deployed as an [Argo Rollouts](https://argoproj.github.io/rollouts/) `Rollout` (`manifests/rollout.yaml`) instead of a Deployment. An update is first started as a canary next to the stable pod, and the `cpu-usage` AnalysisTemplate (`manifests/analysistemplate.yaml`) decides whether it is promoted:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 50
      - analysis:
          templates:
            - templateName: cpu-usage
```

The analysis queries Prometheus (Exercise 4.3) for the total CPU usage rate of all containers in the `exercises` namespace:

```promql
sum(rate(container_cpu_usage_seconds_total{namespace="exercises", container!=""}[2m]))
```

- It is measured every minute for 5 minutes (`interval: 1m`, `count: 6`).
- The limit is hardcoded as `successCondition: result[0] < 0.1`, in CPU cores. The namespace normally uses about 0.015–0.027 cores, even while the canary pod is running next to the stable one, so 0.1 leaves room for normal variation but catches an update that uses clearly more CPU.
- `failureLimit: 0` means a single measurement above the limit fails the analysis. The update is then aborted: the canary is scaled down and the stable version keeps serving.
- `container!=""` leaves out the pod-level cgroup series, which would otherwise count every container twice.

### Setup

Argo Rollouts and Prometheus (see `prometheus/README.md`) are installed in the cluster:

```bash
kubectl create namespace argo-rollouts
kubectl apply --server-side -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/download/v1.10.0/install.yaml
brew install argoproj/tap/kubectl-argo-rollouts

kubectl apply -f ping-pong/manifests/analysistemplate.yaml -f ping-pong/manifests/rollout.yaml
kubectl argo rollouts -n exercises get rollout ping-pong --watch
```

The CRDs are applied server-side because they are too large for the annotation that client-side `kubectl apply` stores.

### Tests

Each update below changed the pod template, and the analysis measurements are CPU cores for the whole namespace.

**A normal update is promoted.** All six measurements stayed under 0.1 and the canary became stable after 5 minutes:

```
AnalysisRun ping-pong-d4478c756-2-1  Successful  0.0245, 0.0270, 0.0176, 0.0169, 0.0197, 0.0194
Status: ✔ Healthy
```

**An update that uses a lot of CPU is reverted.** The container ran a busy loop next to the server (`command: ["sh", "-c", "node -e \"for(;;){}\" & exec node index.js"]`), so the pod was ready but used much more CPU. The second measurement failed and the update was aborted:

```
AnalysisRun ping-pong-78b94c6bd8-3-1  Failed  0.0200, 0.5532
Status:  ✖ Degraded
Message: RolloutAborted: Rollout aborted update to revision 3: Step-based analysis phase error/failed: Metric "cpu-usage" assessed Failed due to failed (1) > failureLimit (0)
Images:  parthvasave/ping-pong:4.1 (stable)
```

**The application is not updated if the value is set too low.** With `successCondition: result[0] < 0.01`, which is below the normal usage of the namespace, the first measurement of an ordinary update failed. The rollout was aborted and the previous version kept serving:

```
AnalysisRun ping-pong-847b66596d-4-1  Failed  0.0168
Status:  ✖ Degraded
Message: RolloutAborted: Rollout aborted update to revision 4: Step-based analysis phase error/failed: Metric "cpu-usage" assessed Failed due to failed (1) > failureLimit (0)
```

An aborted rollout stays `Degraded` until the Rollout is changed again or retried with `kubectl argo rollouts -n exercises retry rollout ping-pong`. After the limit was set back to 0.1, the next update passed all six measurements and the Rollout became `Healthy`.
