import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

// クロスリージョンレプリケーションのセットアップに関する関数とインターフェースを定義
export interface ReplicationSetup {
  replicationRole: iam.Role;
  cfnBucket: s3.CfnBucket;
}


// クロスリージョンレプリケーションをセットアップする関数を定義。これには、S3がセカンダリリージョンのバケットにオブジェクトをレプリケートするためのIAMロールの作成と、プライマリバケットのCloudFormationリソースへのレプリケーション構成の追加が含まれる。
export interface ReplicationSetupProps {
  scope: Construct;
  artifactBucket: s3.Bucket;
  secondaryBucketArn: string;
}

// クロスリージョンレプリケーションをセットアップする関数を定義。これには、S3がセカンダリリージョンのバケットにオブジェクトをレプリケートするためのIAMロールの作成と、プライマリバケットのCloudFormationリソースへのレプリケーション構成の追加が含まれる。
export function setupCrossRegionReplication({
  scope,
  artifactBucket,
  secondaryBucketArn,
}: ReplicationSetupProps): ReplicationSetup {
  const replicationRole = new iam.Role(scope, 'S3ReplicationRole', {
    assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    description: 'Role used by S3 to replicate objects to the secondary region bucket',
  });

  // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
  replicationRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:GetReplicationConfiguration',
        's3:ListBucket',
      ],
      resources: [artifactBucket.bucketArn],
    }),
  );

  // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
  replicationRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:GetObjectVersionForReplication',
        's3:GetObjectVersionAcl',
        's3:GetObjectVersionTagging',
      ],
      resources: [`${artifactBucket.bucketArn}/*`],
    }),
  );

  // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
  replicationRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:ReplicateObject',
        's3:ReplicateDelete',
        's3:ReplicateTags',
      ],
      resources: [`${secondaryBucketArn}/*`],
    }),
  );

  // CDK Nagの警告を抑制。理由は、クロスリージョンレプリケーションはすべてのオブジェクトに対して構成されており、これにはソースと宛先バケットARNのオブジェクトレベルのワイルドカードリソースが必要になるため。
  NagSuppressions.addResourceSuppressions(
    replicationRole,
    [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Cross-region replication is configured for all objects, which requires object-level wildcard resources in source and destination bucket ARNs.',
        appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
      },
    ],
    true,
  );

  // プライマリバケットのCloudFormationリソースにレプリケーション構成を追加する。これには、レプリケーションルールの定義が含まれる。ルールは、すべてのオブジェクトをセカンダリバケットにレプリケートするように構成されており、削除マーカーのレプリケーションも有効になっている。
  const cfnBucket = artifactBucket.node.defaultChild as s3.CfnBucket;
  cfnBucket.replicationConfiguration = {
    role: replicationRole.roleArn,
    rules: [
      {
        id: 'CrossRegionReplicationRule',
        status: 'Enabled',
        priority: 1,
        filter: {
          prefix: '',
        },
        deleteMarkerReplication: {
          status: 'Enabled',
        },
        destination: {
          bucket: secondaryBucketArn,
        },
      },
    ],
  };
  // レプリケーションロールがCloudFormationリソースに依存するようにして、CDKが正しい順序でリソースを作成するようにする。
  cfnBucket.addDependency(replicationRole.node.defaultChild as iam.CfnRole);

  return {
    replicationRole,
    cfnBucket,
  };
}
