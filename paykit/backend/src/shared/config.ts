import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

/** Secrets live in SSM Parameter Store (SecureString). Read once per Lambda container. */
const ssm = new SSMClient({});
const cache = new Map<string, string>();

export async function secret(name: string): Promise<string> {
  const full = `${process.env.PARAM_PREFIX ?? '/paykit'}/${name}`;
  const hit = cache.get(full);
  if (hit) return hit;
  const r = await ssm.send(new GetParameterCommand({ Name: full, WithDecryption: true }));
  const value = r.Parameter?.Value;
  if (!value) throw new Error(`missing parameter ${full}`);
  cache.set(full, value);
  return value;
}
