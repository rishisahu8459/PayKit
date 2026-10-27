import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export const SECRETS: Record<string, string> = {
  '/paykit/merchant-key': 'merchant-secret-123',
  '/paykit/razorpay/key-id': 'rzp_test_abc',
  '/paykit/razorpay/key-secret': 'key_secret',
  '/paykit/razorpay/webhook-secret': 'wh_secret',
};

export const ddbMock = mockClient(DynamoDBDocumentClient);
export const sqsMock = mockClient(SQSClient);
export const ssmMock = mockClient(SSMClient);

export function resetMocks() {
  ddbMock.reset();
  sqsMock.reset();
  ssmMock.reset();
  ddbMock.on(GetParameterCommand as any).callsFake(() => ({}));
  ssmMock.on(GetParameterCommand).callsFake(({ Name }) => ({ Parameter: { Value: SECRETS[Name as string] } }));
  ddbMock.onAnyCommand().resolves({});
  sqsMock.onAnyCommand().resolves({});
}
