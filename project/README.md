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

## DBaaS vs DIY (Exercise 3.9)

The project runs PostgreSQL itself: a StatefulSet with a headless service and a PersistentVolumeClaim in the same namespace as the apps (`todo-backend/manifests/postgres.yaml`). This is compared with a managed database service (DBaaS), such as Google Cloud SQL for PostgreSQL.

Prices are approximate list prices and differ by region; check the Google Cloud pricing pages for exact figures.

### Summary

| | DBaaS (Cloud SQL) | DIY (PostgreSQL in the cluster) |
| --- | --- | --- |
| Initial work | Create an instance, set up networking (private IP or the Cloud SQL Auth Proxy) and IAM | About 50 lines of YAML plus a Secret |
| Time to a working database | Several minutes per instance | Seconds, as part of `kubectl apply` |
| Cost | Separate bill: roughly $8–10/month for the smallest shared-core instance, $50+/month for a dedicated one, double with high availability, plus storage and backups | Uses node capacity that is already paid for, plus the disk (1 GiB ≈ $0.10/month here) |
| Patching and upgrades | Minor versions patched automatically in a maintenance window; major upgrades are a single operation | Done by us: change the image, and dump/restore or `pg_upgrade` for major versions |
| High availability | A checkbox (standby in another zone with automatic failover) | Needs replication set up by hand or an operator such as CloudNativePG |
| Backups | Automated daily backups and point-in-time recovery, restored with one command | Must be built: a `pg_dump` CronJob, volume snapshots or Backup for GKE |
| Monitoring | Built-in metrics, logs and query insights | Must be added (e.g. Prometheus exporter, Loki) |
| Portability | Tied to Google Cloud | The same manifests run on k3d locally and on any Kubernetes cluster |
| Environment per branch | Slow and expensive: one instance (or at least a separate database) per branch | Free and automatic: every branch gets its own PostgreSQL |

### DBaaS

**Pros**

- Very little maintenance: the provider handles the OS, PostgreSQL patches, disk growth (automatic storage increase) and hardware failures.
- Backups work out of the box. Automated daily backups are kept for 7 days by default, and point-in-time recovery restores the database to any moment inside the log retention window. Restoring is one `gcloud sql backups restore` command or a few clicks in the console, either onto the same instance or a new one.
- High availability, read replicas and scaling up the machine are configuration changes rather than projects.
- An SLA (for dedicated instances), encryption at rest, IAM database authentication and audit logging are built in.
- The database lives outside the cluster, so deleting a namespace or even the whole cluster does not touch the data.

**Cons**

- Higher and separate cost. The instance bills around the clock even when idle; high availability doubles it, and storage and backups are billed on top. With free trial credits this is the most significant difference.
- More initial setup: enabling the Cloud SQL Admin API, creating the instance, choosing between private IP (VPC peering) and the Cloud SQL Auth Proxy sidecar, and granting IAM roles to the workload through Workload Identity.
- Creating an instance takes minutes, which does not fit short-lived per-branch environments (Exercises 3.7 and 3.8) well.
- Vendor lock-in and less control: only supported PostgreSQL versions, extensions and settings, and the provider decides when maintenance happens inside the chosen window (a restart of a non-HA instance causes brief downtime).
- The local k3d setup needs a different database, so development and production differ.

### DIY

**Pros**

- Cheap: the database uses capacity on nodes that are already running, and the only extra cost is a small persistent disk per environment.
- Quick and simple to start: `kubectl apply -k project` creates the database together with the app, and the same manifests work locally and on GKE.
- Every branch environment gets its own isolated database automatically, and it is removed with the namespace when the branch is deleted.
- Full control over the PostgreSQL version, configuration and extensions, and no vendor lock-in.

**Cons**

- All maintenance is our responsibility: security patches, major version upgrades (a new data directory format, so dump/restore or `pg_upgrade`), disk resizing, tuning and monitoring.
- Availability is limited. There is a single replica on Spot VMs, so a node being reclaimed restarts the database, and apps must handle the reconnect (the ping-pong app needed a restart after its database pod was replaced).
- Data is easy to lose. The `standard-rwo` storage class uses the `Delete` reclaim policy, so deleting the PVC or the namespace deletes the disk and everything on it.
- Backups have to be designed, scheduled, tested and monitored by us.
- Running PostgreSQL on GKE needed extra care, such as setting `PGDATA` to a subdirectory because a new disk contains a `lost+found` folder.

### Backups

**DBaaS:** automated backups and point-in-time recovery are enabled with a flag when the instance is created. On-demand backups are one command (`gcloud sql backups create`), restores are one command, and backup storage is billed per GB. Restoring over an existing instance replaces its data, so restoring to a new instance is safer for testing. Backups normally belong to the instance, and deleting an instance deletes its automated backups unless they are retained explicitly, so a separate export (`gcloud sql export sql` to Cloud Storage) is still useful.

**DIY:** there are several options, and all of them need work:

- A Kubernetes CronJob that runs `pg_dump` and uploads the dump to a Cloud Storage bucket. It is simple and portable, and restoring is `psql < dump.sql`, but it needs a bucket, credentials for the job, retention rules and regular restore tests. It only captures the moment it runs, so there is no point-in-time recovery.
- CSI volume snapshots (`VolumeSnapshot` with the `pd.csi.storage.gke.io` driver) or Compute Engine disk snapshots. They are fast and incremental, but a snapshot of a running database is only crash-consistent, and restoring means creating a new PVC from the snapshot and pointing the StatefulSet at it.
- Backup for GKE, which backs up namespaces including their volumes. It is easier to use but is a paid service billed per protected pod and per GB.
- Continuous WAL archiving (e.g. with WAL-G or an operator like CloudNativePG) for point-in-time recovery. It is closest to what DBaaS offers, but it is the most complex to set up and maintain.

### Conclusion

For this course project, DIY is the better fit. It costs almost nothing on top of the cluster, works the same locally and on GKE, and makes per-branch environments trivial. For a production service with data that matters, DBaaS is usually worth its price, because backups, point-in-time recovery, patching and high availability come ready-made instead of having to be built and maintained by hand.
