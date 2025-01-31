import { Construct } from 'constructs';
import { Stack, StackProps, DockerImage, Duration } from 'aws-cdk-lib';
import {
  aws_apigateway as apigateway,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_iam as iam
} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

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
              'mkdir -p /root/.cabal/store',
              'apt-get update && apt-get install -y gcc libc6-dev libgmp-dev zlib1g-dev',
              'cabal update',
              '[ ! -f /root/.cabal/store/00-index.cache ] && cabal build --only-dependencies boilerplate-hal || true',
              'cabal build boilerplate-hal',
              'cp $(cabal list-bin boilerplate-hal) /asset-output/bootstrap',
              'chmod +x /asset-output/bootstrap'
            ].join(' && ')
          ],
          volumes: [
            { hostPath: '/tmp/cabal-cache', containerPath: '/root/.cabal' }
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
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['*']
      }
    });

    // Frontend deployment - Updated for public website hosting
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Add public read bucket policy
    // frontendBucket.addToResourcePolicy(new iam.PolicyStatement({
    //   actions: ['s3:GetObject'],
    //   resources: [frontendBucket.arnForObjects('*')],
    //   principals: [new iam.AnyPrincipal()],
    //   effect: iam.Effect.ALLOW
    // }));

    const frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(0)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(0)
        }
      ],
      enabled: true
    });

    // Remove OAC-related configuration as we're using public website hosting

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: frontendBucket.bucketWebsiteUrl,
      description: 'Public website URL'
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [
        s3deploy.Source.asset('../frontend/dist', {
          bundling: {
            image: DockerImage.fromRegistry('node:20'),
            command: [
              'bash', '-c', [
                'cp -r /asset-input/* /asset-output/',
                // Remove the filename manipulation commands
                // Keep this if you need environment variable substitution
                // `sed -i 's|__API_URL__|${exampleApi.url}|g' /asset-output/*.js*`
              ].join(' && ')
            ]
          }
        })
      ],
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ['/*'],
    });
  }
}
