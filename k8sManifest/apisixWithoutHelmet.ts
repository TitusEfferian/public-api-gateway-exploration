import { ConfigMap } from "@cdktf/provider-kubernetes/lib/config-map";
import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
import { Service } from "@cdktf/provider-kubernetes/lib/service";
import { Construct } from "constructs";
import * as yaml from "js-yaml";

export class ApiSixWithoutHelmet extends Construct {
  public readonly deployment: Deployment;
  public readonly service: Service;
  public readonly config: ConfigMap;
  public readonly routesConfig: ConfigMap;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const appName = "apisix";
    const appLabels = { app: appName };

    // --- APISIX Standalone Configuration ---
    // This config tells APISIX to run without etcd and load routes from a local YAML file.
    const apisixConfig = {
      apisix: {
        enable_admin: false,
        node_listen: 9080, // Explicitly set the listen port for the data plane
      },
      deployment: {
        role: "data_plane",
        role_data_plane: {
          config_provider: "yaml",
        },
      },
    };

    this.config = new ConfigMap(this, "apisix-configmap", {
      metadata: {
        name: "apisix-config",
      },
      data: {
        "config.yaml": yaml.dump(apisixConfig),
      },
    });

    // --- APISIX Routes Configuration ---
    // This defines the route from /hello to the internal hello-kubernetes service.
    // The upstream points to the Kubernetes service DNS name.
    const apisixRoutes = {
      routes: [
        {
          id: "hello-route",
          uri: "/hello",
          methods: ["GET"],
          plugins: {
            // Add the proxy-rewrite plugin to change the path for the backend
            "proxy-rewrite": {
              // Rewrite the path from "/hello" to "/"
              uri: "/",
            },
          },
          upstream: {
            type: "roundrobin",
            nodes: {
              // Format: <service-name>.<namespace>.svc.cluster.local:<port>
              "hello-kubernetes.default.svc.cluster.local:80": 1,
            },
          },
        },
      ],
    };

    this.routesConfig = new ConfigMap(this, "apisix-routes-configmap", {
      metadata: {
        name: "apisix-routes-config",
      },

      data: {
        // APISIX requires a special #END flag to ensure the file is completely written
        "apisix.yaml": yaml.dump(apisixRoutes) + "\n#END",
      },
    });

    this.deployment = new Deployment(this, "apisix-deployment", {
      metadata: {
        name: appName,
        labels: appLabels,
      },
      spec: {
        replicas: "1",
        selector: {
          matchLabels: appLabels,
        },
        template: {
          metadata: {
            labels: appLabels,
          },
          spec: {
            volume: [
              {
                name: "apisix-config-volume",
                configMap: {
                  name: this.config.metadata.name,
                },
              },
              {
                name: "apisix-routes-volume",
                configMap: {
                  name: this.routesConfig.metadata.name,
                },
              },
            ],
            container: [
              {
                name: appName,
                image: "apache/apisix:3.10.0-debian",
                port: [
                  {
                    name: "http",
                    containerPort: 9080,
                  },
                  {
                    name: "https",
                    containerPort: 9443,
                  },
                ],
                volumeMount: [
                  {
                    name: "apisix-config-volume",
                    mountPath: "/usr/local/apisix/conf/config.yaml",
                    subPath: "config.yaml",
                    readOnly: true,
                  },
                  {
                    name: "apisix-routes-volume",
                    mountPath: "/usr/local/apisix/conf/apisix.yaml",
                    subPath: "apisix.yaml",
                    readOnly: true,
                  },
                ],
                resources: {
                  limits: {
                    cpu: "1",
                    memory: "1Gi",
                  },
                  requests: {
                    cpu: "500m",
                    memory: "256Mi",
                  },
                },
              },
            ],
          },
        },
      },
    });

    this.service = new Service(this, "apisix-service", {
      metadata: {
        name: `${appName}-gateway`,
      },
      spec: {
        type: "NodePort",
        selector: appLabels,
        port: [
          {
            name: "http",
            port: 80,
            targetPort: "9080",
            protocol: "TCP",
          },
          {
            name: "https",
            port: 443,
            targetPort: "9443",
            protocol: "TCP",
          },
        ],
      },
    });
  }
}
