import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
export interface GithubOidcRoleProps {
    scope: Construct;
    account: string;
    artifactBucket: s3.IBucket;
    githubSubs: string[];
}
export declare function createGithubActionsRole({ scope, account, artifactBucket, githubSubs, }: GithubOidcRoleProps): iam.Role;
