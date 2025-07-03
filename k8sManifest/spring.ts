import { ConfigMap } from "@cdktf/provider-kubernetes/lib/config-map";
import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
import { Service } from "@cdktf/provider-kubernetes/lib/service";
import { Construct } from "constructs";

export class SpringCloudGateway extends Construct {
  public readonly deployment: Deployment;
  public readonly service: Service;
  public readonly config: ConfigMap;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const appName = "spring-gateway";
    const appLabels = { app: appName };

    // Define the Spring Cloud Gateway configuration using YAML.
    // This configuration creates a route that forwards requests from /hello
    // to the internal 'hello-kubernetes' service.
    const springGatewayConfig = `
spring:
  cloud:
    gateway:
      routes:
        - id: hello-kubernetes-route
          # The URI points to the internal Kubernetes service for our target application.
          # The 'lb' scheme is not needed here as we are using Kubernetes' internal DNS.
          uri: http://hello-kubernetes:80
          predicates:
            # This route is matched for any request whose path starts with /hello/
            - Path=/hello/**
          filters:
            # This filter rewrites the path before forwarding.
            # It strips the '/hello' prefix from the path.
            # For example, a request to /hello/world becomes /world when forwarded.
            - RewritePath=/hello/(?<segment>.*), /\\$\\{segment}
server:
  port: 8080
`;

    // Create a ConfigMap to hold the application.yml configuration.
    // This allows us to manage the gateway's configuration separately from its image.
    this.config = new ConfigMap(this, "spring-gateway-configmap", {
      metadata: {
        name: "spring-gateway-config",
      },
      data: {
        "application.yml": springGatewayConfig,
      },
    });

    // Create the Deployment for the Spring Cloud Gateway application.
    this.deployment = new Deployment(this, "spring-gateway-deployment", {
      metadata: {
        name: `${appName}-deployment`,
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
            // Define a volume that points to our ConfigMap.
            volume: [
              {
                name: "spring-gateway-config-volume",
                configMap: {
                  name: this.config.metadata.name,
                },
              },
            ],
            container: [
              {
                name: appName,
                // Using a versioned, community-provided image for Spring Cloud Gateway.
                // In a real-world scenario, you would likely build and use your own image.
                image: "navikt/spring-cloud-gateway:2023.1.3",
                // Mount the ConfigMap volume into the container at /config.
                volumeMount: [
                  {
                    name: "spring-gateway-config-volume",
                    mountPath: "/config",
                    readOnly: true,
                  },
                ],
                port: [
                  {
                    containerPort: 8080,
                  },
                ],
                // Use environment variables to tell Spring Boot where to find our external configuration.
                env: [
                  {
                    name: "SPRING_CONFIG_LOCATION",
                    value: "file:/config/application.yml",
                  },
                ],
                // Applying security best practices, similar to the kraken deployment.
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
              },
            ],
          },
        },
      },
    });

    // Create a Service to expose the Spring Cloud Gateway deployment to external traffic.
    this.service = new Service(this, "spring-gateway-service", {
      metadata: {
        labels: appLabels,
        name: `${appName}-service`,
      },
      spec: {
        // NodePort makes the service accessible on a static port on each node in the cluster.
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
