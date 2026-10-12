import {
  AllocateAddressCommand, AssociateAddressCommand, DescribeInstancesCommand, EC2Client, ReleaseAddressCommand, RunInstancesCommand,
  TerminateInstancesCommand, DescribeAddressesCommand,
} from "@aws-sdk/client-ec2";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import type { CertProbe, EgressCloud, RelayState } from "./cloud";
import { RELAY_NAME } from "./relay-userdata";

// The real AWS side. Everything it creates is tagged maa:managed=user-egress and it refuses to terminate or release
// anything that isn't, so a bug can never touch the shared NAT address, the database or the website.

const MANAGED = { Key: "maa:managed", Value: "user-egress" };
const region = () => process.env.AWS_REGION ?? "ap-south-1";

export type CloudConfig = { subnets: string[]; launchTemplate: string; securityGroup: string; fallbackTypes: string[] };
export function cloudConfigFromEnv(): CloudConfig {
  const subnets = (process.env.USER_EGRESS_SUBNETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const launchTemplate = process.env.USER_EGRESS_LAUNCH_TEMPLATE ?? "";
  const securityGroup = process.env.USER_EGRESS_SG ?? "";
  if (!subnets.length || !launchTemplate || !securityGroup) throw new Error("USER_EGRESS_SUBNETS, USER_EGRESS_LAUNCH_TEMPLATE and USER_EGRESS_SG are not set");
  return { subnets, launchTemplate, securityGroup, fallbackTypes: ["t4g.micro"] };
}

const capacityError = (e: unknown) => /InsufficientInstanceCapacity|Unsupported|capacity/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));

export function awsEgressCloud(cfg: CloudConfig = cloudConfigFromEnv(), client = new EC2Client({ region: region() })): EgressCloud {
  async function assertManaged(resource: "instance" | "address", id: string) {
    if (resource === "instance") {
      const r = await client.send(new DescribeInstancesCommand({ InstanceIds: [id] }));
      const tags = r.Reservations?.[0]?.Instances?.[0]?.Tags ?? [];
      if (!tags.some((t) => t.Key === MANAGED.Key && t.Value === MANAGED.Value)) throw new Error(`refusing to touch ${id}: not a user-egress relay`);
    } else {
      const r = await client.send(new DescribeAddressesCommand({ AllocationIds: [id] }));
      const tags = r.Addresses?.[0]?.Tags ?? [];
      if (!tags.some((t) => t.Key === MANAGED.Key && t.Value === MANAGED.Value)) throw new Error(`refusing to touch ${id}: not a user-egress address`);
    }
  }
  return {
    async allocateIp(userId) {
      const r = await client.send(new AllocateAddressCommand({
        Domain: "vpc",
        TagSpecifications: [{ ResourceType: "elastic-ip", Tags: [MANAGED, { Key: "maa:user", Value: userId }, { Key: "Name", Value: `myalgoagent-user-ip-${userId.slice(-6)}` }] }],
      }));
      if (!r.AllocationId || !r.PublicIp) throw new Error("AllocateAddress returned no address");
      return { allocationId: r.AllocationId, publicIp: r.PublicIp };
    },
    async launchRelay(userId, userData, idempotencyKey) {
      let lastErr: unknown = null;
      for (const type of [undefined, ...cfg.fallbackTypes]) {
        for (const subnet of cfg.subnets) {
          try {
            const r = await client.send(new RunInstancesCommand({
              MinCount: 1, MaxCount: 1,
              LaunchTemplate: { LaunchTemplateName: cfg.launchTemplate, Version: "$Latest" },
              ...(type ? { InstanceType: type as never } : {}),
              // A temporary public address so the relay can install itself while it boots; the user's Elastic IP replaces it.
              NetworkInterfaces: [{ DeviceIndex: 0, SubnetId: subnet, AssociatePublicIpAddress: true, Groups: [cfg.securityGroup], DeleteOnTermination: true }],
              UserData: Buffer.from(userData).toString("base64"),
              ClientToken: idempotencyKey,
              TagSpecifications: [{ ResourceType: "instance", Tags: [MANAGED, { Key: "maa:user", Value: userId }, { Key: "Name", Value: `myalgoagent-relay-${userId.slice(-6)}` }] }],
            }));
            const id = r.Instances?.[0]?.InstanceId;
            if (id) return { instanceId: id };
          } catch (e) {
            lastErr = e;
            if (!capacityError(e)) throw e;
          }
        }
      }
      throw lastErr ?? new Error("no capacity for a relay");
    },
    async describeRelay(instanceId): Promise<RelayState> {
      const r = await client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
      const i = r.Reservations?.[0]?.Instances?.[0];
      if (!i) return { state: "terminated", privateIp: null, publicIp: null };
      const s = i.State?.Name;
      const state = s === "pending" || s === "running" || s === "stopping" || s === "stopped" || s === "shutting-down" || s === "terminated" ? s : "unknown";
      return { state, privateIp: i.PrivateIpAddress ?? null, publicIp: i.PublicIpAddress ?? null };
    },
    async associateIp(allocationId, instanceId) {
      await assertManaged("address", allocationId);
      await client.send(new AssociateAddressCommand({ AllocationId: allocationId, InstanceId: instanceId, AllowReassociation: false }));
    },
    async terminateRelay(instanceId) {
      await assertManaged("instance", instanceId);
      await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    },
    async releaseIp(allocationId) {
      await assertManaged("address", allocationId);
      await client.send(new ReleaseAddressCommand({ AllocationId: allocationId }));
    },
  };
}

/** Reads the certificate the relay presents. The relay is on our private network and was started by us moments ago. */
export const tlsCertProbe: CertProbe = (host, port) =>
  new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: RELAY_NAME, rejectUnauthorized: false, timeout: 5000 }, () => {
      const raw = sock.getPeerCertificate(true)?.raw;
      sock.end();
      if (!raw) return reject(new Error("no certificate"));
      const pem = new X509Certificate(raw).toString();
      resolve(pem);
    });
    sock.on("error", reject);
    sock.on("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
  });
