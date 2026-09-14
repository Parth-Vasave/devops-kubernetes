import * as k8s from "@kubernetes/client-node";

const GROUP = "stable.dwk";
const VERSION = "v1";
const PLURAL = "dummysites";
const PAGE_IMAGE = "nginx:1.29-alpine";
const FETCH_IMAGE = "curlimages/curl:8.16.0";

const kc = new k8s.KubeConfig();
// In the cluster this uses the pod's service account, locally the current kubeconfig context
kc.loadFromDefault();
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const resourceName = (dummySite) => `dummysite-${dummySite.metadata.name}`;

// The created resources belong to the DummySite, so Kubernetes deletes them when the DummySite is deleted
const ownerReference = (dummySite) => ({
  apiVersion: `${GROUP}/${VERSION}`,
  kind: "DummySite",
  name: dummySite.metadata.name,
  uid: dummySite.metadata.uid,
  controller: true,
});

const labelsFor = (dummySite) => ({ app: resourceName(dummySite), "dummysite.stable.dwk/name": dummySite.metadata.name });

const deploymentFor = (dummySite) => ({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: resourceName(dummySite),
    labels: labelsFor(dummySite),
    ownerReferences: [ownerReference(dummySite)],
  },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: resourceName(dummySite) } },
    template: {
      metadata: { labels: labelsFor(dummySite) },
      spec: {
        // The init container downloads the page into a volume that nginx then serves
        initContainers: [{
          name: "fetch-website",
          image: FETCH_IMAGE,
          env: [{ name: "WEBSITE_URL", value: dummySite.spec.website_url }],
          // $(WEBSITE_URL) is expanded by Kubernetes, not by a shell, so the URL cannot inject commands
          args: ["--fail", "--silent", "--show-error", "--location", "--user-agent", "dummysite-controller/1.0",
            "--output", "/html/index.html", "$(WEBSITE_URL)"],
          volumeMounts: [{ name: "html", mountPath: "/html" }],
          resources: { requests: { cpu: "10m", memory: "16Mi" }, limits: { cpu: "200m", memory: "64Mi" } },
        }],
        containers: [{
          name: "website",
          image: PAGE_IMAGE,
          ports: [{ containerPort: 80 }],
          volumeMounts: [{ name: "html", mountPath: "/usr/share/nginx/html", readOnly: true }],
          readinessProbe: { httpGet: { path: "/", port: 80 }, periodSeconds: 5 },
          resources: { requests: { cpu: "10m", memory: "16Mi" }, limits: { cpu: "200m", memory: "64Mi" } },
        }],
        volumes: [{ name: "html", emptyDir: {} }],
      },
    },
  },
});

const serviceFor = (dummySite) => ({
  apiVersion: "v1",
  kind: "Service",
  metadata: {
    name: resourceName(dummySite),
    labels: labelsFor(dummySite),
    ownerReferences: [ownerReference(dummySite)],
  },
  spec: {
    selector: { app: resourceName(dummySite) },
    ports: [{ port: 80, targetPort: 80 }],
  },
});

const isConflict = (err) => err?.code === 409;

// Creates the resource, or brings an existing one up to date (e.g. after website_url changed)
const createOrUpdate = async (kind, create, read, replace, namespace, body) => {
  try {
    await create({ namespace, body });
    console.log(`Created ${kind} ${namespace}/${body.metadata.name}`);
  } catch (err) {
    if (!isConflict(err)) throw err;
    const existing = await read({ name: body.metadata.name, namespace });
    body.metadata.resourceVersion = existing.metadata.resourceVersion;
    if (kind === "Service") {
      body.spec.clusterIP = existing.spec.clusterIP;
    }
    await replace({ name: body.metadata.name, namespace, body });
    console.log(`Updated ${kind} ${namespace}/${body.metadata.name}`);
  }
};

const reconcile = async (dummySite) => {
  const { namespace, name } = dummySite.metadata;
  const url = dummySite.spec?.website_url;
  if (!url) {
    console.error(`DummySite ${namespace}/${name} has no website_url, skipping`);
    return;
  }
  console.log(`Reconciling DummySite ${namespace}/${name} (${url})`);
  await createOrUpdate("Deployment",
    (args) => appsApi.createNamespacedDeployment(args), (args) => appsApi.readNamespacedDeployment(args),
    (args) => appsApi.replaceNamespacedDeployment(args), namespace, deploymentFor(dummySite));
  await createOrUpdate("Service",
    (args) => coreApi.createNamespacedService(args), (args) => coreApi.readNamespacedService(args),
    (args) => coreApi.replaceNamespacedService(args), namespace, serviceFor(dummySite));
};

const watchDummySites = async () => {
  const watch = new k8s.Watch(kc);
  // A new watch without a resourceVersion first reports every existing DummySite as ADDED
  await watch.watch(`/apis/${GROUP}/${VERSION}/${PLURAL}`, {},
    (type, dummySite) => {
      if (type === "ADDED" || type === "MODIFIED") {
        reconcile(dummySite).catch((err) =>
          console.error(`Failed to reconcile ${dummySite.metadata.namespace}/${dummySite.metadata.name}:`, err.body ?? err.message));
      } else if (type === "DELETED") {
        console.log(`DummySite ${dummySite.metadata.namespace}/${dummySite.metadata.name} deleted, its resources are garbage collected`);
      }
    },
    (err) => {
      // Watches end regularly (timeouts, API server restarts), so start a new one
      if (err) console.error("Watch ended with an error:", err.message);
      setTimeout(() => watchDummySites().catch(onWatchFailure), 2000);
    });
  console.log("Watching DummySite resources");
};

const onWatchFailure = (err) => {
  console.error("Could not start the watch, retrying in 5 seconds:", err.message);
  setTimeout(() => watchDummySites().catch(onWatchFailure), 5000);
};

watchDummySites().catch(onWatchFailure);
