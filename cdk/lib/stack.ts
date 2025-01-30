import { Construct } from 'constructs';
import { Stack, StackProps, DockerImage, Duration } from 'aws-cdk-lib';
import {
  aws_apigateway as apigateway,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_iam as iam
} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';

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
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['*']
      }
    });

    // Frontend deployment
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${id}`
    });

    frontendBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [frontendBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));

    const frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS
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
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: frontendDistribution.distributionDomainName,
      description: 'The domain name of the CloudFront distribution'
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: exampleApi.url,
      description: 'The URL of the API Gateway endpoint'
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [
        s3deploy.Source.asset('../frontend', {
          bundling: {
            image: DockerImage.fromRegistry('node:20'),
            command: [
              'bash', '-c', [
                'cd /asset-input && npm install && npm run build',
                'cp -r /asset-input/dist/* /asset-output/',
                // `sed -i 's|"__API_URL__"|"${exampleApi.url}"|g' /asset-output/*.js`
                // `sed -i 's|"__API_URL__"|"http://example.com:3000"|g' /asset-output/*.js`
              ].join(' && ')
            ]
          }
        })
      ],
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ['/*']
    });
  }
}
