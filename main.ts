import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { HelloKraken } from "./k8sManifest/krakend";
import { HelloKubernetes } from "./k8sManifest/internalTarget";

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    new KubernetesProvider(this, "k8s", {
      configPath: "~/.kube/config",
    });

    new HelloKraken(this, "kraken");
    new HelloKubernetes(this, "internal-target");
  }
}

const app = new App();
new MyStack(app, "apiGatewayLocal");
app.synth();
