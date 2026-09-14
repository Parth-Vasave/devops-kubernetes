# Knative Serving

Exercise 5.6 – DevOps with Kubernetes. Knative Serving 1.23.0 with the Kourier network layer and Magic DNS (sslip.io) on a local k3d cluster.

## Cluster and installation

```bash
k3d cluster create knative --port 8082:30080@agent:0 -p 8081:80@loadbalancer --agents 2 \
  --k3s-arg "--disable=traefik@server:0" --image rancher/k3s:v1.34.1-k3s1

kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.23.0/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.23.0/serving-core.yaml

# Network layer: Kourier
kubectl apply -f https://github.com/knative-extensions/net-kourier/releases/download/knative-v1.23.0/kourier.yaml
kubectl patch configmap/config-network --namespace knative-serving --type merge \
  --patch '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'

# DNS: Magic DNS (sslip.io)
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.23.0/serving-default-domain.yaml
```

The other k3d cluster (`k3s-default`, used in Exercises 5.1–5.4) was stopped with `k3d cluster stop k3s-default` first, because Docker Desktop does not have enough memory for both.

All Knative components became ready without the crash loop shown in the exercise:

```
$ kubectl get pods -n knative-serving
NAME                                      READY   STATUS      RESTARTS   AGE
activator-56d698c974-946f9                1/1     Running     0          63s
autoscaler-69fcf466cb-26g2v               1/1     Running     0          63s
controller-5857b6bf55-nsstl               1/1     Running     0          63s
default-domain-jndwn                      0/1     Completed   0          29s
net-kourier-controller-5d74dfdd6f-dw9z5   1/1     Running     0          61s
webhook-5cdb4c6879-nxhm6                  1/1     Running     0          62s
```

The `default-domain` job's first attempt failed because the Knative webhook was not ready yet, and its retry completed. If the components do crash, their logs usually show that they cannot reach the API server or the webhook yet, or that the Kubernetes version is too old for this Knative release. Kubernetes 1.34 from the command above avoids the version problem.

The services are reached through the k3d load balancer on port 8081 with the service's sslip.io host name in the `Host` header.

## Deploying a Knative Service

`hello.yaml` is the `hello` service from the guide (`ghcr.io/knative/helloworld-go`, `TARGET=World`):

```
$ kubectl apply -f knative/hello.yaml
service.serving.knative.dev/hello created
$ kubectl get ksvc
NAME    URL                                        LATESTCREATED   LATESTREADY   READY   REASON
hello   http://hello.default.172.19.0.3.sslip.io   hello-00001     hello-00001   True    
$ curl -H "Host: hello.default.172.19.0.3.sslip.io" http://localhost:8081
Hello World!
```

## Autoscaling

Knative scales the service to zero when it gets no requests, and the next request starts a pod again (a cold start):

```
# Autoscaling: after about 82s without requests the service scaled to zero
$ kubectl get pod -l serving.knative.dev/service=hello
No resources found in default namespace.
$ time curl -H "Host: hello.default.172.19.0.3.sslip.io" http://localhost:8081   # cold start
Hello World!
(1.7 s)
$ kubectl get pod -l serving.knative.dev/service=hello
NAME                                      READY   STATUS    RESTARTS   AGE
hello-00001-deployment-5bc4b54c87-b2bgn   2/2     Running   0          1s
```

## Traffic splitting

`hello-traffic-split.yaml` changes `TARGET` to `Knative`, which creates the revision `hello-00002`, and splits the traffic 50/50 between the latest revision and `hello-00001`:

```
$ kubectl apply -f knative/hello-traffic-split.yaml
service.serving.knative.dev/hello configured
$ kubectl get revisions
NAME          CONFIG NAME   GENERATION   READY   REASON   ACTUAL REPLICAS   DESIRED REPLICAS
hello-00001   hello         1            True             1                 1
hello-00002   hello         2            True             1                 
$ kubectl get ksvc hello -o jsonpath='{range .status.traffic[*]}{.revisionName} {.percent}%{"\n"}{end}'
hello-00002 50%
hello-00001 50%
$ for i in $(seq 1 100); do curl -s -H "Host: hello.default.172.19.0.3.sslip.io" http://localhost:8081; done | sort | uniq -c
  46 Hello Knative!
  54 Hello World!
```
