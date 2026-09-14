# Todo Backend

A web service created for DevOps with Kubernetes Exercise 2.2.

## Description

Provides a REST API for managing todo items (stored in a PostgreSQL database since Exercise 2.8).

Database connection settings are read from the `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` environment variables.

A CronJob (`manifests/cronjob.yaml`, Exercise 2.9) creates a `Read <URL>` todo for a random Wikipedia article every hour.

- `GET /todos` — returns the list of all todos as JSON.
- `POST /todos` — creates a new todo. Requires a JSON body `{ "content": "..." }`. Content must be ≤ 140 characters.

Every request is logged (method, path, status code, duration), along with each received todo and whether it was created or rejected.

## Monitoring (Exercise 2.10)

Logs are collected with Loki and viewed in Grafana:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
kubectl create namespace prometheus
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack --namespace prometheus
kubectl create namespace loki-stack
helm install loki grafana/loki-stack --namespace loki-stack
```

In Grafana, add a Loki data source with the URL `http://loki.loki-stack:3100`, then query rejected todos in Explore:

```
{namespace="project", app="todo-backend"} |= "Rejected"
```

## Run Locally

Install dependencies:

```bash
npm install
```

Run:

```bash
node index.js
```
