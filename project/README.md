# Todo Project

Kustomize entry point for the todo project (Exercise 3.5). It combines `todo-app/manifests` and `todo-backend/manifests`, puts everything in the `project` namespace, and sets the image tags.

## Deploy

```bash
kubectl apply -k project
sops --decrypt todo-backend/manifests/secret.enc.yaml | kubectl apply -f -
```

The database secret is encrypted with SOPS, so it is applied separately. Point SOPS at the age key with `export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt`.

On Google Kubernetes Engine the app is exposed through a Gateway:

```bash
kubectl -n project get gateway todo-gateway
```
