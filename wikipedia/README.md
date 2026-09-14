# Wikipedia with init and sidecar containers

Exercise 5.4 – DevOps with Kubernetes.

`deployment.yaml` runs one pod with three containers that share an `emptyDir` volume, plus a Service:

| Container | Kind | What it does |
| --- | --- | --- |
| `fetch-kubernetes-page` | init container | Runs once before the others start: `curl` saves https://en.wikipedia.org/wiki/Kubernetes as `index.html` |
| `random-page-updater` | sidecar | In a loop, waits a random time between 5 and 15 minutes (`shuf -i 300-900`), fetches https://en.wikipedia.org/wiki/Special:Random (following the redirect) and replaces `index.html` |
| `nginx` | main container | Serves the volume from its public www directory `/usr/share/nginx/html` (mounted read-only) |

- **Native sidecar:** the updater is an init container with `restartPolicy: Always` (a native sidecar, Kubernetes 1.29+). Kubernetes starts it after the one-off init container and keeps it running next to nginx, and it shows up in the pod's `READY 2/2`. A plain second container in `containers` would also work.
- **Atomic update:** the random page is downloaded to `index.html.tmp` and then moved over `index.html`, so nginx never serves a partly written page. If a download fails, the current page stays.
- **User agent:** both `curl` calls send a user agent, as Wikipedia asks clients to.
- **Configurable wait:** `MIN_WAIT_SECONDS` and `MAX_WAIT_SECONDS` hold the 300 and 900 second limits.

## Usage

```bash
kubectl apply -f wikipedia/deployment.yaml
kubectl port-forward svc/wikipedia 8080:80   # http://localhost:8080/
kubectl logs deploy/wikipedia -c random-page-updater -f
```

## Test (k3d)

Right after deployment the pod is running with nginx and the sidecar, and nginx serves the page from the init container:

```
$ kubectl get po -l app=wikipedia
NAME                        READY   STATUS    RESTARTS   AGE
wikipedia-9dfd848f4-64w8l   2/2     Running   0          47s

$ kubectl exec deploy/wikipedia -c nginx -- sh -c 'wget -qO- http://localhost/ | grep -o "<title>[^<]*</title>"'
<title>Kubernetes - Wikipedia</title>
```

After the sidecar's first random wait (406 seconds), the page is replaced by a random article and the next wait starts:

```
$ kubectl logs deploy/wikipedia -c random-page-updater
Waiting 406 seconds before fetching a random page
https://en.wikipedia.org/wiki/Margarita_Morozova
Waiting 546 seconds before fetching a random page

$ kubectl exec deploy/wikipedia -c nginx -- sh -c 'wget -qO- http://localhost/ | grep -o "<title>[^<]*</title>"'
<title>Margarita Morozova - Wikipedia</title>
```
