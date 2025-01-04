import { Construct } from 'constructs';
import { Stack, StackProps, DockerImage, Duration } from 'aws-cdk-lib';
import {
  aws_apigateway as apigateway,
  aws_lambda as lambda
} from 'aws-cdk-lib';

export class WaiHandlerHalCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const exampleLambda = new lambda.Function(this, 'boilerplate', {
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../', {
        bundling: {
          image: DockerImage.fromRegistry('public.ecr.aws/docker/library/haskell:9.6.4'),
          platform: 'linux/arm64',
          command: [
            'bash', '-c', [
              // Install system dependencies
              'apt-get update && apt-get install -y gcc libc6-dev libgmp-dev zlib1g-dev',
              // Update cabal
              'cabal update',
              // Install dependencies first
              'cabal build --only-dependencies boilerplate-hal',
              // Build the actual binary
              'cabal build boilerplate-hal',
              // Copy the binary to the output location
              'cp $(cabal list-bin boilerplate-hal) /asset-output/bootstrap',
              'chmod +x /asset-output/bootstrap',
              // Verify the binary
              'file /asset-output/bootstrap'
            ].join(' && ')
          ],
          user: 'root',
          environment: {
            'CABAL_DIR': '/root/.cabal'
          }
        }
      }),
      handler: 'bootstrap',
      runtime: lambda.Runtime.PROVIDED_AL2,
      memorySize: 1024,
      timeout: Duration.seconds(30),
    });

    const exampleApi = new apigateway.LambdaRestApi(
      this,
      'boilerplate-api', {
      handler: exampleLambda,
      proxy: true
    });
  }
}
