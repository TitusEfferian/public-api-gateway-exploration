// import { Construct } from "constructs";
// import { ClusterRole } from "@cdktf/provider-kubernetes/lib/cluster-role";
// import { ClusterRoleBinding } from "@cdktf/provider-kubernetes/lib/cluster-role-binding";
// import { ConfigMap } from "@cdktf/provider-kubernetes/lib/config-map";
// import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
// import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
// import { Namespace } from "@cdktf/provider-kubernetes/lib/namespace";
// import { Service } from "@cdktf/provider-kubernetes/lib/service";
// import { ServiceAccount } from "@cdktf/provider-kubernetes/lib/service-account";
// import { StatefulSet } from "@cdktf/provider-kubernetes/lib/stateful-set";
// import { Fn } from "cdktf";
// import { NullProvider } from "../.gen/providers/null/provider";
// import { Resource } from "../.gen/providers/null/resource";

// // Raw YAML for APISIX Custom Resource Definitions (CRDs).
// // In a real-world scenario, you might fetch these from a URL or a local file.
// // These are required for Kubernetes to understand objects like 'ApisixRoute'.
// const APISIX_CRD_YAML = [
//   // --- ApisixRoute CRD ---
//   `
// apiVersion: apiextensions.k8s.io/v1
// kind: CustomResourceDefinition
// metadata:
//   name: apisixroutes.apisix.apache.org
// spec:
//   group: apisix.apache.org
//   names:
//     kind: ApisixRoute
//     plural: apisixroutes
//     shortNames:
//     - ar
//     singular: apisixroute
//   scope: Namespaced
//   versions:
//   - name: v2
//     schema:
//       openAPIV3Schema:
//         type: object
//         x-kubernetes-preserve-unknown-fields: true
//     served: true
//     storage: true
// `,
//   // --- ApisixUpstream CRD ---
//   `
// apiVersion: apiextensions.k8s.io/v1
// kind: CustomResourceDefinition
// metadata:
//   name: apisixupstreams.apisix.apache.org
// spec:
//   group: apisix.apache.org
//   names:
//     kind: ApisixUpstream
//     plural: apisixupstreams
//     shortNames:
//     - au
//     singular: apisixupstream
//   scope: Namespaced
//   versions:
//   - name: v2
//     schema:
//       openAPIV3Schema:
//         type: object
//         x-kubernetes-preserve-unknown-fields: true
//     served: true
//     storage: true
// `,
//   // Add other CRDs like ApisixTls, ApisixClusterConfig, etc. as needed.
// ];

// export class HelloApisixNoHelm extends Construct {
//   constructor(scope: Construct, id: string) {
//     super(scope, id);

//     // --- Provider for the Null Resource ---
//     // This provider is needed for the local-exec provisioner.
//     new NullProvider(this, "null");

//     const apisixNamespace = "apisix";
//     const appLabels = { app: "apisix" };

//     // --- 1. Namespace ---
//     // Create a dedicated namespace for all APISIX components.
//     const ns = new Namespace(this, "apisix-namespace", {
//       metadata: { name: apisixNamespace },
//     });

//     // --- 2. CRD Installation using the Manifest resource ---
//     // Apply the raw CRD YAMLs to the cluster. This must happen before any
//     // ApisixRoute objects are created.
//     const crds = APISIX_CRD_YAML.map(
//       (crd, i) =>
//         new Manifest(this, `apisix-crd-${i}`, {
//           // The dependsOn ensures the namespace exists first.
//           dependsOn: [ns],
//           // The manifest property takes the parsed YAML object.
//           manifest: Fn.yamldecode(crd),
//         }),
//     );

//     // --- 2a. Wait for CRDs to be Established ---
//     // This resource introduces an explicit wait. It will only complete after the
//     // Kubernetes API server has fully registered the CRDs.
//     const crdWaiter = new Resource(this, "crd-waiter", {
//       dependsOn: crds, // Depend on all CRD manifests
//       provisioners: [
//         {
//           type: "local-exec",
//           // This command waits until both CRDs are established in the cluster.
//           // It will poll until the condition is met or the timeout is reached.
//           command:
//             "kubectl wait --for condition=established crd/apisixroutes.apisix.apache.org --timeout=120s && kubectl wait --for condition=established crd/apisixupstreams.apisix.apache.org --timeout=120s",
//         },
//       ],
//     });

//     // --- 3. RBAC for Ingress Controller ---
//     // APISIX needs permissions to watch services, endpoints, secrets, etc.
//     const serviceAccount = new ServiceAccount(this, "apisix-sa", {
//       metadata: {
//         name: "apisix-ingress-controller",
//         namespace: apisixNamespace,
//       },
//       dependsOn: [ns],
//     });

//     const clusterRole = new ClusterRole(this, "apisix-cluster-role", {
//       metadata: { name: "apisix-ingress-controller-role" },
//       rule: [
//         {
//           apiGroups: ["*"],
//           resources: [
//             "secrets",
//             "services",
//             "endpoints",
//             "namespaces",
//             "nodes",
//           ],
//           verbs: ["get", "list", "watch"],
//         },
//         {
//           apiGroups: ["networking.k8s.io"],
//           resources: ["ingresses", "ingressclasses"],
//           verbs: ["get", "list", "watch"],
//         },
//         {
//           apiGroups: ["apisix.apache.org"],
//           resources: [
//             "apisixroutes",
//             "apisixupstreams",
//             "apisixtlses",
//             "apisixclusterconfigs",
//           ],
//           verbs: ["get", "list", "watch", "update", "patch"],
//         },
//         // Add more rules as needed based on official documentation
//       ],
//     });

//     new ClusterRoleBinding(this, "apisix-cluster-role-binding", {
//       metadata: { name: "apisix-ingress-controller-binding" },
//       roleRef: {
//         apiGroup: "rbac.authorization.k8s.io",
//         kind: "ClusterRole",
//         name: clusterRole.metadata.name,
//       },
//       subject: [
//         {
//           kind: "ServiceAccount",
//           name: serviceAccount.metadata.name,
//           namespace: apisixNamespace,
//         },
//       ],
//     });

//     // --- 4. ETCD Datastore ---
//     // A simple, single-replica StatefulSet for etcd.
//     // WARNING: This is for demonstration only. It uses emptyDir and is NOT persistent.
//     // For production, you MUST use a persistent volume.
//     const etcdName = "apisix-etcd";
//     const etcdService = new Service(this, "etcd-service", {
//       metadata: { name: etcdName, namespace: apisixNamespace },
//       spec: {
//         clusterIp: "None", // Headless service for StatefulSet
//         port: [
//           { name: "client", port: 2379 },
//           { name: "peer", port: 2380 },
//         ],
//         selector: { app: etcdName },
//       },
//     });

//     new StatefulSet(this, "etcd-statefulset", {
//       metadata: { name: etcdName, namespace: apisixNamespace },
//       spec: {
//         serviceName: etcdService.metadata.name,
//         replicas: "1",
//         selector: { matchLabels: { app: etcdName } },
//         template: {
//           metadata: { labels: { app: etcdName } },
//           spec: {
//             container: [
//               {
//                 name: "etcd",
//                 image: "bitnami/etcd:3.5",
//                 env: [{ name: "ALLOW_NONE_AUTHENTICATION", value: "yes" }],
//                 port: [{ containerPort: 2379 }, { containerPort: 2380 }],
//                 volumeMount: [
//                   { name: "etcd-data", mountPath: "/bitnami/etcd" },
//                 ],
//               },
//             ],
//             // Data will be lost if the pod is deleted. Use a PersistentVolumeClaim for production.
//             volume: [{ name: "etcd-data", emptyDir: {} }],
//           },
//         },
//       },
//     });

//     // --- 5. APISIX Configuration ---
//     const apisixConfig = new ConfigMap(this, "apisix-configmap", {
//       metadata: { name: "apisix-config", namespace: apisixNamespace },
//       data: {
//         "config.yaml": `
// apisix:
//   node_listen: 9080
//   enable_admin: true
//   enable_prometheus: true
// deployment:
//   role: data_plane
//   role_data_plane:
//     config_provider: etcd
//   etcd:
//     host:
//       - http://apisix-etcd:2379 # Points to the etcd service
//     prefix: /apisix
// `,
//       },
//     });

//     // --- 6. APISIX Deployment (Gateway & Ingress Controller) ---
//     const apisixDeployment = new Deployment(this, "apisix-deployment", {
//       metadata: {
//         name: "apisix",
//         namespace: apisixNamespace,
//         labels: appLabels,
//       },
//       spec: {
//         replicas: "1",
//         selector: { matchLabels: appLabels },
//         template: {
//           metadata: { labels: appLabels },
//           spec: {
//             serviceAccountName: serviceAccount.metadata.name,
//             container: [
//               {
//                 name: "apisix-ingress-controller",
//                 image: "apache/apisix-ingress-controller:1.7.0",
//                 args: ["ingress", "--config-path", "/conf/config.yaml"],
//                 volumeMount: [
//                   { name: "apisix-config-volume", mountPath: "/conf" },
//                 ],
//               },
//             ],
//             volume: [
//               {
//                 name: "apisix-config-volume",
//                 configMap: { name: apisixConfig.metadata.name },
//               },
//             ],
//           },
//         },
//       },
//     });

//     // --- 7. Expose APISIX via Services ---
//     // Service to expose the gateway to external traffic
//     new Service(this, "apisix-gateway-service", {
//       metadata: { name: "apisix-gateway", namespace: apisixNamespace },
//       spec: {
//         type: "NodePort",
//         port: [{ port: 80, targetPort: "9080", protocol: "TCP", name: "http" }],
//         selector: appLabels,
//       },
//     });

//     // --- 8. Define the Route using the Manifest resource ---
//     // Finally, create the ApisixRoute object to route traffic.
//     new Manifest(this, "hello-apisix-route", {
//       // This now depends on the waiter, which only completes after the CRDs are ready.
//       dependsOn: [crdWaiter, apisixDeployment],
//       manifest: {
//         apiVersion: "apisix.apache.org/v2",
//         kind: "ApisixRoute",
//         metadata: {
//           name: "hello-kubernetes-route",
//           namespace: "default", // Route is in the same namespace as the target service
//         },
//         spec: {
//           http: [
//             {
//               name: "hello-rule",
//               match: { paths: ["/hello"] },
//               backends: [
//                 {
//                   serviceName: "hello-kubernetes",
//                   servicePort: 80,
//                 },
//               ],
//             },
//           ],
//         },
//       },
//     });
//   }
// }
import { Construct } from "constructs";
import { Release } from "../.gen/providers/helm/release";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { TimeProvider } from "../.gen/providers/time/provider";
import { Sleep } from "../.gen/providers/time/sleep";

export class HelloApisix extends Construct {
  public readonly apisixRelease: Release;
  public readonly apisixRoute: Manifest;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // --- Provider for the Time Resource ---
    // This provider is needed for the Sleep resource.
    new TimeProvider(this, "time");

    const apisixNamespace = "apisix";

    // --- 1. Deploy Apache APISIX using the official Helm Chart ---
    // This is the recommended method. It handles the deployment of the gateway,
    // etcd, dashboard, and the Ingress Controller, which installs the CRDs.
    this.apisixRelease = new Release(this, "apisix-helm-chart", {
      name: "apisix",
      chart: "apisix",
      repository: "https://charts.apiseven.com",
      version: "2.1.0",
      namespace: apisixNamespace,
      createNamespace: true,
      set: [
        {
          name: "ingress-controller.enabled",
          value: "true",
        },
        {
          name: "dashboard.enabled",
          value: "true",
        },
      ],
    });

    // --- 2. Wait for CRDs to be Established ---
    // This Sleep resource introduces an explicit pause. It depends on the Helm release
    // and will wait for 30 seconds after the release is applied before completing.
    // This gives the Kubernetes API server ample time to register the CRDs.
    const crdWaiter = new Sleep(this, "crd-waiter", {
      dependsOn: [this.apisixRelease],
      createDuration: "30s",
    });

    // --- 3. Define the Route using the ApisixRoute Custom Resource ---
    // This manifest now depends on the 'crdWaiter' resource, ensuring it is only
    // created after the pause is complete.
    this.apisixRoute = new Manifest(this, "hello-apisix-route", {
      dependsOn: [crdWaiter],
      manifest: {
        apiVersion: "apisix.apache.org/v2",
        kind: "ApisixRoute",
        metadata: {
          name: "hello-kubernetes-route",
          namespace: "default",
        },
        spec: {
          http: [
            {
              name: "hello-rule",
              match: {
                paths: ["/hello"],
              },
              backends: [
                {
                  serviceName: "hello-kubernetes",
                  servicePort: 80,
                },
              ],
            },
          ],
        },
      },
    });
  }
}
