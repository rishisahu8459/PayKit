import * as cdk from 'aws-cdk-lib';
import { PayKitStack } from '../lib/stack';

const app = new cdk.App();
new PayKitStack(app, 'PayKit', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-south-1' },
  senderEmail: process.env.SENDER_EMAIL ?? 'replace-me@example.com', // must be verified in SES
});
