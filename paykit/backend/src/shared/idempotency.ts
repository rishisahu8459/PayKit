import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './db';

/**
 * Records expire after 24 hours (DynamoDB TTL on attribute `ttl`).
 * Claim first, then store the response. A retry with the same key gets the stored response.
 */
export type Claim = { state: 'new' } | { state: 'replay'; response: unknown } | { state: 'in_progress' };

const pkOf = (scope: string, key: string) => `IDEM#${scope}#${key}`;

export async function claim(scope: string, key: string): Promise<Claim> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { pk: pkOf(scope, key), sk: 'META', state: 'IN_PROGRESS', ttl: Math.floor(Date.now() / 1000) + 86400 },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return { state: 'new' };
  } catch (e: any) {
    if (e.name !== 'ConditionalCheckFailedException') throw e;
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: pkOf(scope, key), sk: 'META' } }));
    if (r.Item?.state === 'DONE') return { state: 'replay', response: r.Item.response };
    return { state: 'in_progress' };
  }
}

export async function complete(scope: string, key: string, response: unknown) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE, Key: { pk: pkOf(scope, key), sk: 'META' },
    UpdateExpression: 'SET #s = :d, response = :r',
    ExpressionAttributeNames: { '#s': 'state' },
    ExpressionAttributeValues: { ':d': 'DONE', ':r': response },
  }));
}

/** Let the client retry after a failure instead of getting stuck on IN_PROGRESS. */
export async function release(scope: string, key: string) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: pkOf(scope, key), sk: 'META' } }));
}
