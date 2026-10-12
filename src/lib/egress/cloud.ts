// What the provisioner needs from AWS, as an interface so the state machine is tested without it.

export type RelayState = { state: "pending" | "running" | "stopping" | "stopped" | "terminated" | "unknown"; privateIp: string | null; publicIp: string | null };

export interface EgressCloud {
  /** A fresh Elastic IP for this user (tagged so only we can touch it). */
  allocateIp(userId: string): Promise<{ allocationId: string; publicIp: string }>;
  /** Starts the user's relay in one of the public subnets; returns the instance id. Tries the next subnet / size on a capacity refusal. */
  launchRelay(userId: string, userData: string, idempotencyKey: string): Promise<{ instanceId: string }>;
  describeRelay(instanceId: string): Promise<RelayState>;
  associateIp(allocationId: string, instanceId: string): Promise<void>;
  terminateRelay(instanceId: string): Promise<void>;
  releaseIp(allocationId: string): Promise<void>;
}

/** Reads the certificate a relay presents (trust on first use, inside our private network, right after we launched it). */
export type CertProbe = (host: string, port: number) => Promise<string>;
