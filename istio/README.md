# Istio ambient mode

Exercise 5.2 – DevOps with Kubernetes. Istio 1.31.0 in ambient mode on the local k3d cluster, following the [ambient getting started guide](https://istio.io/latest/docs/ambient/getting-started/) with the Bookinfo sample app up to "Clean up".

## Install

```bash
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.31.0 sh -
export PATH=$PWD/istio-1.31.0/bin:$PATH

istioctl install --set profile=ambient --set values.global.platform=k3d \
  --set values.cni.cniBinDir=/var/lib/rancher/k3s/data/cni --skip-confirmation
```

`values.global.platform=k3d` sets the k3s CNI configuration directory, but it installs the `istio-cni` plugin binary into `/bin`. This k3s version (v1.35.5+k3s1) looks for CNI plugins in `/var/lib/rancher/k3s/data/cni`, so without `values.cni.cniBinDir` every pod failed with `failed to find plugin "istio-cni" in path [/var/lib/rancher/k3s/data/cni]`: ztunnel could not start and no pod could be created or deleted. Because of that, the first broken install had to be unblocked by copying `/bin/istio-cni` into that directory on each node (`docker exec k3d-k3s-default-agent-0 cp /bin/istio-cni /var/lib/rancher/k3s/data/cni/`) before the corrected install could roll out.

The Gateway API CRDs were already installed on the cluster.

## Bookinfo

```bash
kubectl apply -f samples/bookinfo/platform/kube/bookinfo.yaml -f samples/bookinfo/platform/kube/bookinfo-versions.yaml
kubectl apply -f samples/bookinfo/gateway-api/bookinfo-gateway.yaml
kubectl annotate gateway bookinfo-gateway networking.istio.io/service-type=ClusterIP --namespace=default
kubectl port-forward svc/bookinfo-gateway-istio 8080:80   # http://localhost:8080/productpage
```

## Secure and visualize

```bash
kubectl label namespace default istio.io/dataplane-mode=ambient
```

Prometheus was already installed on the cluster with kube-prometheus-stack in the `prometheus` namespace (Exercise 2.10), so Kiali uses it instead of the Istio Prometheus addon:

- `kiali.yaml` is Istio's `samples/addons/kiali.yaml` with `url: http://kube-prometheus-stack-prometheus.prometheus:9090` under `prometheus`.
- kube-prometheus-stack only scrapes what ServiceMonitors and PodMonitors select, so `prometheus-podmonitors.yaml` adds PodMonitors for ztunnel (L4 metrics such as `istio_tcp_connections_opened_total`), waypoint proxies (L7 metrics such as `istio_requests_total`) and istiod, labelled `release: kube-prometheus-stack` so its Prometheus picks them up.

```bash
kubectl apply -f prometheus-podmonitors.yaml
kubectl apply -f kiali.yaml
for i in $(seq 1 100); do curl -sSI -o /dev/null http://localhost:8080/productpage; done
istioctl dashboard kiali
```

Prometheus scrapes all Istio targets (3 ztunnel, 2 waypoint and 1 istiod target up) and records both L4 and L7 mesh metrics, e.g. `sum(istio_tcp_connections_opened_total)` = 730 and `sum(istio_requests_total)` = 422 after the traffic above.

The Kiali pod itself could not start: its image is only published on quay.io (`quay.io/kiali/kiali:v2.27`), and Quay returned `502 Bad Gateway` / `504 Gateway Time-out` for every pull during this exercise (`ghcr.io` has no public copy). The Kiali configuration above is applied, so the pod starts and shows the traffic graph once the image can be pulled.

## Enforce authorization policies

**L4 policy** (`productpage-viewer-l4.yaml`, enforced by ztunnel): only the Bookinfo gateway's service account may connect to productpage.

```
$ curl -s http://localhost:8080/productpage | grep -o "<title>.*</title>"   # through the gateway
<title>Simple Bookstore App</title>
$ kubectl exec deploy/curl -- curl -s "http://productpage:9080/productpage"   # from the curl pod
command terminated with exit code 56
```

**Waypoint proxy** for L7 features:

```
$ istioctl waypoint apply --enroll-namespace --wait
✅ waypoint default/waypoint applied
✅ waypoint default/waypoint is ready!
✅ namespace default labeled with "istio.io/use-waypoint: waypoint"
$ kubectl get gtw waypoint
NAME       CLASS            ADDRESS        PROGRAMMED   AGE
waypoint   istio-waypoint   10.43.83.241   True         3s
```

**L7 policy** (`productpage-viewer-l7.yaml`, enforced by the waypoint): only `GET` requests from the `curl` service account are allowed. Unlike the guide, the policy also allows the gateway, so the app keeps working in the browser and Kiali keeps receiving traffic.

```
$ kubectl exec deploy/curl -- curl -s -X DELETE "http://productpage:9080/productpage"
RBAC: access denied
$ kubectl exec deploy/reviews-v1 -- curl -s "http://productpage:9080/productpage"
RBAC: access denied
$ kubectl exec deploy/curl -- curl -s "http://productpage:9080/productpage" | grep -o "<title>.*</title>"
<title>Simple Bookstore App</title>
```

## Manage traffic

`route-reviews-90-10.yaml` (from `samples/bookinfo/gateway-api`) splits traffic for the reviews service 90/10 between v1 and v2:

```
$ kubectl exec deploy/curl -- sh -c "for i in \$(seq 1 100); do curl -s http://productpage:9080/productpage | grep reviews-v.-; done" | sort | uniq -c
 174 reviews-v1
  26 reviews-v2
```

Every product page contains the name of the reviews pod twice, so over 100 page loads v1 served 87 and v2 served 13.
