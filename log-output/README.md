# Log Output

Exercise 2.1 – DevOps with Kubernetes.

## Description

The Log Output application is split into two containers running in the same Kubernetes Pod.

- **Generator container:** generates a random string on startup and writes the current timestamp and random string to `/shared-data/log.txt` every 5 seconds (shared via an `emptyDir` volume within the pod).
- **Log Output container:** on every `GET /`, reads the latest log line and fetches the current ping count from the Ping-Pong service via `GET http://ping-pong:3000/pings`.

The two pods communicate over HTTP inside the cluster — no shared volume between them.

## GitOps with Argo CD (Exercise 4.7)

Log output is deployed with GitOps: the cluster follows what is in the repository, and a commit is all it takes to update the application.

```
commit to log-output/ ──▶ GitHub Actions: build image, push to Artifact Registry, commit the new tag to manifests/kustomization.yaml
                                                                                   │
            exercises namespace ◀── Argo CD syncs log-output/manifests from main ◀──┘
```

1. A push to `main` that changes `log-output/` (except Markdown files) starts the `Release log output` workflow (`.github/workflows/log-output.yaml`). It builds the image, pushes it to Artifact Registry (`asia-south1-docker.pkg.dev/devops-kubernetes-508609/exercises/log-output:<commit SHA>`), runs `kustomize edit set image` and commits the new tag as `github-actions[bot]`. The workflow never touches the cluster, and commits pushed with `GITHUB_TOKEN` do not start new workflow runs, so the tag commit cannot cause a loop.
2. The Argo CD Application `log-output` (`argocd-application.yaml`) tracks `log-output/manifests` on `main`. Automated sync applies every new commit, `prune` deletes resources that are removed from Git, and `selfHeal` reverts changes made directly in the cluster.

All of Log output's manifests (Deployment, Service, ConfigMap, Gateway and HTTPRoute) are in `manifests/kustomization.yaml`.

### Setup

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.3/manifests/install.yaml
kubectl apply -f log-output/argocd-application.yaml

# Artifact Registry repository for the image; the deploy service account can push to it
gcloud artifacts repositories create exercises --repository-format=docker --location=asia-south1
gcloud artifacts repositories add-iam-policy-binding exercises --location=asia-south1 \
  --role=roles/artifactregistry.writer \
  --member=serviceAccount:github-actions-deployer@devops-kubernetes-508609.iam.gserviceaccount.com
```

The repository has the same cleanup policy as the project's registry (keep the 5 newest images, delete older ones after a day), so the image referenced in Git is always kept.

The Argo CD UI is available through a port-forward, with the user `admin` and the initial password from a secret:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode; echo
```

### Test

Committing a change to `log-output/index.js` (serving the response as `text/plain` so browsers keep the line breaks) updated the running application without any `kubectl` commands:

```
+0s    pushed 03781f7 "Serve log output as plain text"
+50s   release workflow done, github-actions[bot] committed 1db4471 "Release log-output 03781f7"
+135s  Argo CD: OutOfSync (1db4471)
+141s  Argo CD: Synced (1db4471)
+146s  GET / now returns content-type: text/plain
```

Argo CD checks the repository every 3 minutes, which is most of the delay. A GitHub webhook to Argo CD would make it instant, but that needs the Argo CD server exposed to the internet.

Self-heal was checked by scaling the Deployment to 3 replicas with `kubectl`; Argo CD set it back to the 1 replica in Git within 3 seconds.

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
