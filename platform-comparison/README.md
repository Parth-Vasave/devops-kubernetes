# Rancher vs OpenShift

Exercise 5.5 – DevOps with Kubernetes.

**Rancher** (SUSE) is a management platform that runs on top of almost any Kubernetes cluster and can also create clusters with its own distributions RKE2 and K3s. **Red Hat OpenShift** is a complete Kubernetes distribution that bundles its own operating system, developer tooling and security defaults into one product.

**Choice: Rancher is the better platform**, especially for teams that run several clusters in different places and want to stay close to plain Kubernetes.

## Why Rancher is better

- **Works with the clusters you already have.** Rancher imports and manages any conformant cluster: GKE, EKS, AKS, k3d/K3s on a laptop, RKE2 on bare metal. OpenShift manages OpenShift clusters; a fleet with GKE and k3d, like the one in this course, would need a separate tool.
- **Plain, upstream Kubernetes.** Clusters behind Rancher run standard Kubernetes, so manifests, Helm charts, Gateway API and tutorials work unchanged. OpenShift adds its own resources and defaults (Routes, DeploymentConfigs in older setups, stricter Security Context Constraints), so many public images and charts need changes before they run, for example images that expect to run as root.
- **Lower cost and an open-source core.** Rancher, RKE2, K3s and Fleet are Apache 2.0 licensed and free to use; SUSE sells optional support (Rancher Prime). OpenShift Container Platform is a paid subscription for every cluster, and its free upstream, OKD, trails the commercial release and has no vendor support.
- **Lighter footprint.** Rancher's management server can run on a small cluster, and K3s runs on edge devices with about half a gigabyte of memory. A standard OpenShift cluster expects three control plane nodes and considerably more resources; single-node OpenShift is available but still heavy.
- **Less lock-in.** Leaving Rancher means uninstalling a management layer while the clusters and workloads keep running. Leaving OpenShift means migrating workloads off OpenShift-specific resources, its registry, its build system and Red Hat CoreOS nodes.
- **Built-in multi-cluster GitOps.** Fleet deploys the same Git repository to hundreds or thousands of clusters by labels, which suits edge and retail setups. OpenShift GitOps (Argo CD) and Advanced Cluster Management can do this, but ACM is a separate paid add-on.
- **Simpler operations for small teams.** Upgrading a K3s or RKE2 cluster is a matter of replacing binaries or using the system upgrade controller; the Rancher UI adds users, projects, monitoring and logging on top. OpenShift upgrades are well automated but cover the whole stack including the OS, which works best when everything follows Red Hat's supported configuration.

## What OpenShift does better (and why it does not change the choice)

- **More included out of the box**: builds (Source-to-Image, Tekton-based Pipelines), an internal image registry, a developer console, service mesh and serverless as supported operators. Rancher expects you to pick these yourself, but that also means using the tools the team already knows (GitHub Actions, Argo CD, Istio as in this course).
- **Stronger security defaults**: containers run as random non-root users, and SELinux and SCCs are enforced on Red Hat CoreOS. Rancher clusters can reach a similar level with Pod Security Admission, NeuVector (SUSE's open-source container security) and CIS-hardened RKE2, at the cost of configuring it.
- **One vendor for the whole stack**, which regulated enterprises already using RHEL often prefer. For teams without that requirement, the price and the lock-in outweigh the convenience.

## Summary

| | Rancher | OpenShift |
| --- | --- | --- |
| What it is | Management layer for any Kubernetes, plus RKE2/K3s | Full Kubernetes distribution with its own OS |
| Clusters it manages | Any conformant cluster (cloud, on-premises, edge) | OpenShift clusters |
| Kubernetes flavour | Upstream | Upstream with OpenShift-specific resources and stricter defaults |
| License and cost | Open source, optional paid support | Paid subscription per cluster; OKD as unsupported upstream |
| Footprint | Small; K3s runs on edge devices | Large; three control plane nodes recommended |
| Developer tooling | Bring your own | Built in (builds, registry, console, pipelines) |
| Multi-cluster GitOps | Fleet included | Argo CD included; fleet management with paid ACM |
| Lock-in | Low | High |

Rancher gives most of what a team needs from a Kubernetes platform while staying cheap, portable and close to upstream Kubernetes. OpenShift is the better fit only when an organisation specifically wants one vendor to own and support the entire stack.
