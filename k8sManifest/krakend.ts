import { ConfigMap } from "@cdktf/provider-kubernetes/lib/config-map";
import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
import { Service } from "@cdktf/provider-kubernetes/lib/service";
import { Construct } from "constructs";

export class HelloKraken extends Construct {
  public readonly deployment: Deployment;
  public readonly service: Service;
  public readonly config: ConfigMap;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const appName = "kraken";
    const appLabels = { app: appName };

    const krakendConfig = {
      version: 3,
      port: 8080,
      endpoints: [
        {
          endpoint: "/hello",
          method: "GET",
          output_encoding: "no-op",
          backend: [
            {
              host: ["http://hello-kubernetes:80"],
              url_pattern: "/",
            },
          ],
        },
      ],
    };

    this.config = new ConfigMap(this, "kraken-configmap", {
      metadata: {
        name: "krakend-config",
      },
      data: {
        "krakend.json": JSON.stringify(krakendConfig, null, 2),
      },
    });
    this.deployment = new Deployment(this, "kraken_deployment", {
      metadata: {
        name: `${appName}-deployment`,
        labels: appLabels,
      },
      spec: {
        selector: {
          matchLabels: appLabels,
        },
        replicas: "2",
        template: {
          metadata: {
            labels: appLabels,
          },
          spec: {
            volume: [
              {
                name: "krakend-config",
                configMap: {
                  name: this.config.metadata.name,
                },
              },
            ],
            container: [
              {
                name: appName,
                image: "krakend:latest",
                volumeMount: [
                  {
                    name: "krakend-config",
                    mountPath: "/etc/krakend",
                  },
                ],
                port: [
                  {
                    containerPort: 8080,
                  },
                ],
                command: ["/usr/bin/krakend"],
                args: [
                  "run",
                  "-d",
                  "-c",
                  "/etc/krakend/krakend.json",
                  "-p",
                  "8080",
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  runAsNonRoot: true,
                  runAsUser: "1000",
                  readOnlyRootFilesystem: true,
                  capabilities: {
                    drop: ["ALL"],
                    add: ["NET_BIND_SERVICE"],
                  },
                },
                env: [
                  {
                    name: "KRAKEND_PORT",
                    value: "8080",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    this.service = new Service(this, "kraken_service", {
      metadata: {
        labels: appLabels,
        name: `${appName}-service`,
      },
      spec: {
        type: "NodePort",
        port: [
          {
            port: 80,
            targetPort: "8080",
            protocol: "TCP",
          },
        ],
        selector: appLabels,
      },
    });
  }
}
