import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export interface PayKitStackProps extends cdk.StackProps {
  senderEmail: string; // must be verified in SES
}

export class PayKitStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PayKitStackProps) {
    super(scope, id, props);

    // One table: orders, the append-only ledger, and idempotency records (TTL cleans them up).
    const table = new dynamodb.Table(this, 'Table', {
      tableName: 'PayKit',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // demo only. Use RETAIN for a real ledger.
    });

    const dlq = new sqs.Queue(this, 'ReceiptDlq', { retentionPeriod: cdk.Duration.days(14) });
    const queue = new sqs.Queue(this, 'ReceiptQueue', {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const ssmArn = `arn:aws:ssm:${this.region}:${this.account}:parameter/paykit/*`;
    const sesArn = `arn:aws:ses:${this.region}:${this.account}:identity/${props.senderEmail}`;

    const fn = (name: string, file: string, timeoutSec = 10) => {
      const f = new NodejsFunction(this, name, {
        entry: path.join(__dirname, '../src/handlers', file),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(timeoutSec),
        bundling: { minify: true },
        environment: {
          TABLE_NAME: table.tableName,
          PARAM_PREFIX: '/paykit',
          QUEUE_URL: queue.queueUrl,
          SENDER_EMAIL: props.senderEmail,
        },
      });
      f.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [ssmArn] }));
      return f;
    };

    const createOrder = fn('CreateOrder', 'createOrder.ts');
    const getOrder = fn('GetOrder', 'getOrder.ts');
    const verifyPayment = fn('VerifyPayment', 'verifyPayment.ts');
    const webhook = fn('RazorpayWebhook', 'webhook.ts');
    const refundStart = fn('RefundStart', 'refundStart.ts');
    const refundWorker = fn('RefundWorker', 'refundWorker.ts', 30);
    const receipt = fn('ReceiptSender', 'receipt.ts', 30);

    table.grantReadWriteData(createOrder);
    table.grantReadWriteData(verifyPayment);
    table.grantReadWriteData(webhook);
    table.grantReadWriteData(refundStart);
    table.grantReadWriteData(refundWorker);
    table.grantReadData(getOrder);
    table.grantReadData(receipt);
    queue.grantSendMessages(verifyPayment);
    queue.grantSendMessages(webhook);
    receipt.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: [sesArn] }));
    receipt.addEventSource(new SqsEventSource(queue, { batchSize: 5 }));

    // Refund workflow: retry only infrastructure errors. Razorpay errors go straight to rollback,
    // so a refund is never retried blindly (that could refund twice).
    const markFailed = new tasks.LambdaInvoke(this, 'MarkRefundFailed', {
      lambdaFunction: refundWorker,
      payload: sfn.TaskInput.fromObject({ orderId: sfn.JsonPath.stringAt('$.orderId'), action: 'markFailed' }),
      outputPath: '$.Payload',
    }).next(new sfn.Fail(this, 'RefundFailed'));

    const refund = new tasks.LambdaInvoke(this, 'Refund', {
      lambdaFunction: refundWorker,
      payload: sfn.TaskInput.fromObject({ orderId: sfn.JsonPath.stringAt('$.orderId') }),
      outputPath: '$.Payload',
    });
    refund.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException'],
      interval: cdk.Duration.seconds(2), maxAttempts: 3, backoffRate: 2,
    });
    refund.addCatch(markFailed, { errors: ['States.ALL'], resultPath: '$.error' });

    const machine = new sfn.StateMachine(this, 'RefundMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(refund),
      timeout: cdk.Duration.minutes(10),
    });
    refundStart.addEnvironment('REFUND_STATE_MACHINE_ARN', machine.stateMachineArn);
    machine.grantStartExecution(refundStart);

    const api = new apigw.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'], // tighten to your storefront's origin in production
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
        allowHeaders: ['content-type', 'idempotency-key', 'x-merchant-key'],
      },
    });
    const route = (p: string, m: apigw.HttpMethod, f: NodejsFunction) =>
      api.addRoutes({ path: p, methods: [m], integration: new HttpLambdaIntegration(`${f.node.id}Int`, f) });
    route('/orders', apigw.HttpMethod.POST, createOrder);
    route('/orders/{orderId}', apigw.HttpMethod.GET, getOrder);
    route('/orders/{orderId}/refunds', apigw.HttpMethod.POST, refundStart);
    route('/payments/verify', apigw.HttpMethod.POST, verifyPayment);
    route('/webhooks/razorpay', apigw.HttpMethod.POST, webhook);

    // Throttle the public API so a bug or a bot cannot run up your free allowance.
    const stage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 20 };

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
