// fail
import { ConfigMap } from "@cdktf/provider-kubernetes/lib/config-map";
import { Deployment } from "@cdktf/provider-kubernetes/lib/deployment";
import { Service } from "@cdktf/provider-kubernetes/lib/service";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";

const tomlContent = fs.readFileSync(
  path.join(__dirname, "wsoconfig/deployment.toml"),
  "utf-8",
);

export class WsoApiGateway extends Construct {
  public readonly deployment: Deployment;
  public readonly service: Service;
  public readonly serverConfig: ConfigMap;
  public readonly apiConfig: ConfigMap;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const appName = "wso2-am";
    const appLabels = { app: appName };
    const wso2Version = "4.0.0";
    const wso2Home = `/home/wso2carbon/wso2am-${wso2Version}`;

    this.serverConfig = new ConfigMap(this, "wso2-server-config", {
      metadata: {
        name: `${appName}-config-toml`,
      },
      data: {
        "deployment.toml": tomlContent.replace(/\$\{/g, "$${"),
      },
    });

    this.apiConfig = new ConfigMap(this, "wso2-api-def", {
      metadata: {
        name: `${appName}-api-def`,
      },
      data: {
        "HelloWSO2_v1.xml": `
<api xmlns="http://ws.apache.org/ns/synapse" name="HelloWSO2" context="/hello" version="1.0">
    <resource methods="GET" uri-template="/*">
        <inSequence>
            <!-- Disable security for this API to allow direct access -->
            <property name="api.auth.type" value="None" scope="axis2"/>
            <send>
                <endpoint>
                    <!-- Route to the internal Kubernetes service -->
                    <http uri-template="http://hello-kubernetes.default.svc.cluster.local{uri.var.path}"/>
                </endpoint>
            </send>
        </inSequence>
        <outSequence>
            <send/>
        </outSequence>
        <faultSequence/>
    </resource>
</api>
        `,
      },
    });

    this.deployment = new Deployment(this, "wso2-deployment", {
      metadata: {
        name: appName,
        labels: appLabels,
      },
      spec: {
        replicas: "1", // WSO2 can be resource-intensive; starting with 1 replica.
        selector: {
          matchLabels: appLabels,
        },
        template: {
          metadata: {
            labels: appLabels,
          },
          spec: {
            // Define volumes from our ConfigMaps
            volume: [
              {
                name: "wso2-server-config-vol",
                configMap: {
                  name: this.serverConfig.metadata.name,
                },
              },
              {
                name: "wso2-api-def-vol",
                configMap: {
                  name: this.apiConfig.metadata.name,
                },
              },
            ],
            container: [
              {
                name: appName,
                image: `wso2/wso2am:${wso2Version}`,
                port: [
                  { name: "gw-http", containerPort: 8280 },
                  { name: "gw-https", containerPort: 8243 },
                  { name: "mgt-https", containerPort: 9443 },
                ],
                volumeMount: [
                  {
                    name: "wso2-server-config-vol",
                    mountPath: `${wso2Home}/repository/conf/deployment.toml`,
                    subPath: "deployment.toml",
                    readOnly: true,
                  },
                  {
                    name: "wso2-api-def-vol",
                    mountPath: `${wso2Home}/repository/deployment/server/synapse-configs/default/api/HelloWSO2_v1.xml`,
                    subPath: "HelloWSO2_v1.xml",
                    readOnly: true,
                  },
                ],
                resources: {
                  requests: { cpu: "1", memory: "2Gi" },
                  limits: { cpu: "2", memory: "3Gi" },
                },
                livenessProbe: {
                  tcpSocket: [
                    {
                      port: "9443",
                    },
                  ],
                  initialDelaySeconds: 180, // WSO2 takes time to start up
                  periodSeconds: 20,
                },
                readinessProbe: {
                  httpGet: {
                    path: "/services/Version",
                    port: "9443",
                    scheme: "HTTPS",
                  },
                  initialDelaySeconds: 180,
                  periodSeconds: 20,
                },
              },
            ],
          },
        },
      },
    });

    this.service = new Service(this, "wso2-service", {
      metadata: {
        name: `${appName}-service`,
      },
      spec: {
        type: "NodePort",
        selector: appLabels,
        port: [
          {
            name: "http",
            port: 80,
            targetPort: "8280", // Route external HTTP to the gateway's HTTP port
            protocol: "TCP",
          },
          {
            name: "https",
            port: 443,
            targetPort: "8243", // Route external HTTPS to the gateway's HTTPS port
            protocol: "TCP",
          },
          {
            name: "management",
            port: 9443,
            targetPort: "9443", // Expose the management console
            protocol: "TCP",
          },
        ],
      },
    });
  }
}
