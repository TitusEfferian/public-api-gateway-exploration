import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
import { Service } from "@cdktf/provider-kubernetes/lib/service";
import { Construct } from "constructs";

export class HelloKubernetes extends Construct {
  public readonly service: Service;
  public readonly deployment: Deployment;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const appName = "hello-kubernetes";
    const appLabels = { app: appName };

    // +++ HELLO-KUBERNETES DEPLOYMENT +++
    this.deployment = new Deployment(this, "hello-kubernetes-deployment", {
      metadata: {
        name: appName,
        labels: appLabels,
      },
      spec: {
        replicas: "2",
        selector: {
          matchLabels: appLabels,
        },
        template: {
          metadata: {
            labels: appLabels,
          },
          spec: {
            container: [
              {
                name: appName,
                image: "paulbouwer/hello-kubernetes:1.10",
                port: [
                  {
                    containerPort: 8080,
                  },
                ],
                resources: {
                  limits: {
                    cpu: "0.5",
                    memory: "512Mi",
                  },
                  requests: {
                    cpu: "250m",
                    memory: "50Mi",
                  },
                },
              },
            ],
          },
        },
      },
    });

    this.service = new Service(this, "hello-kubernetes-service", {
      metadata: {
        name: appName,
      },
      spec: {
        selector: appLabels,
        port: [
          {
            port: 80,
            targetPort: "8080",
            protocol: "TCP",
          },
        ],
        type: "ClusterIP",
      },
    });
  }
}
