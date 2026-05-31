"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecondaryBucketStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cdk_nag_1 = require("cdk-nag");
// 定数オブジェクトを定義してマジックナンバーを排除
const STORAGE_CONFIG = {
    RETENTION_DAYS: 30,
    HISTORY_RETENTION_DAYS: 7,
    BUCKET_PREFIX: 'bevy-artifacts',
    LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
};
const ACCOUNT_ID_REGEX = /^\d{12}$/;
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
class SecondaryBucketStack extends cdk.Stack {
    bucketName;
    constructor(scope, id, props) {
        const hasExplicitAccount = Object.prototype.hasOwnProperty.call(props.env ?? {}, 'account');
        const explicitAccount = props.env?.account;
        if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
            throw new Error('env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.');
        }
        super(scope, id, props);
        // AwsSolutions-S1 対策:
        // セカンダリバケットのサーバーアクセスログ保存先として専用バケットを用意する。
        // ログバケット自体は「ログの受け皿」用途のため、ネストしたアクセスログは設定しない。
        const secondaryAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        // cdk-nagでセカンダリバケットのアクセスログバケットに対する警告を抑制（このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため）
        cdk_nag_1.NagSuppressions.addResourceSuppressions(secondaryAccessLogBucket, [
            {
                //  このバケットはセカンダリバケットのアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
                id: 'AwsSolutions-S1',
                // なお、このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
                reason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
            },
        ], true);
        // 環境名とアカウントIDを組み合わせて一意性を担保
        const secondaryBucket = new s3.Bucket(this, 'BevyArtifactBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            // AwsSolutions-S10 対策:
            // セカンダリバケットにも HTTPS(TLS) のみを許可するポリシーを強制する。
            // CDK がバケットポリシーに「aws:SecureTransport=false を Deny」するルールを自動生成する。
            // プライマリバケット（BevyArtifactBucket）と同一方針を適用する。
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            // AwsSolutions-S1 対策:
            // セカンダリ本体バケットのアクセスログを専用ログバケットへ出力する。
            serverAccessLogsBucket: secondaryAccessLogBucket,
            serverAccessLogsPrefix: 'access-logs/',
            lifecycleRules: [
                {
                    id: 'ExpireOldBuilds',
                    enabled: true,
                    expiration: cdk.Duration.days(STORAGE_CONFIG.RETENTION_DAYS),
                    noncurrentVersionExpiration: cdk.Duration.days(STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
                },
            ],
        });
        this.bucketName = secondaryBucket.bucketName;
        // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
        new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
            value: secondaryBucket.bucketName,
        });
    }
}
exports.SecondaryBucketStack = SecondaryBucketStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6QyxxQ0FBMEM7QUFFMUMsMkJBQTJCO0FBQzNCLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLHNCQUFzQixFQUFFLENBQUM7SUFDekIsYUFBYSxFQUFFLGdCQUFnQjtJQUMvQixpQkFBaUIsRUFBRSxxQkFBcUI7Q0FDaEMsQ0FBQztBQUNYLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDO0FBT3BDLHVDQUF1QztBQUN2QyxNQUFhLG9CQUFxQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2pDLFVBQVUsQ0FBUztJQUVuQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDO1FBQzNDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3ZGLE1BQU0sSUFBSSxLQUFLLENBQ2IsK0dBQStHLENBQ2hILENBQUM7UUFDSixDQUFDO1FBRUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsc0JBQXNCO1FBQ3RCLHlDQUF5QztRQUN6Qyw0Q0FBNEM7UUFDNUMsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHNDQUFzQyxFQUFFO1lBQzNGLFVBQVUsRUFBRSxHQUFHLGNBQWMsQ0FBQyxpQkFBaUIsSUFBSSxLQUFLLENBQUMsT0FBTyxjQUFjLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDNUYsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUM7UUFDSCxtR0FBbUc7UUFDbkcseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsd0JBQXdCLEVBQ3hCO1lBQ0U7Z0JBQ0UsaUdBQWlHO2dCQUNqRyxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQix5RkFBeUY7Z0JBQ3pGLE1BQU0sRUFBRSxzSEFBc0g7YUFDL0g7U0FDRixFQUNELElBQUksQ0FDTCxDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLE1BQU0sZUFBZSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDekUsVUFBVSxFQUFFLEdBQUcsY0FBYyxDQUFDLGFBQWEsSUFBSSxLQUFLLENBQUMsT0FBTyxjQUFjLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDeEYsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLHVCQUF1QjtZQUN2QiwyQ0FBMkM7WUFDM0MsZ0VBQWdFO1lBQ2hFLDJDQUEyQztZQUMzQyxVQUFVLEVBQUUsSUFBSTtZQUNoQixTQUFTLEVBQUUsSUFBSTtZQUNmLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixzQkFBc0I7WUFDdEIsb0NBQW9DO1lBQ3BDLHNCQUFzQixFQUFFLHdCQUF3QjtZQUNoRCxzQkFBc0IsRUFBRSxjQUFjO1lBQ3RDLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsaUJBQWlCO29CQUNyQixPQUFPLEVBQUUsSUFBSTtvQkFDYixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQztvQkFDNUQsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDO2lCQUN0RjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFVBQVUsR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDO1FBRTdDLDBEQUEwRDtRQUMxRCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQ25ELEtBQUssRUFBRSxlQUFlLENBQUMsVUFBVTtTQUNsQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF6RUQsb0RBeUVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gJ2Nkay1uYWcnO1xuXG4vLyDlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgpLlrprnvqnjgZfjgabjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjgpLmjpLpmaRcbmNvbnN0IFNUT1JBR0VfQ09ORklHID0ge1xuICBSRVRFTlRJT05fREFZUzogMzAsXG4gIEhJU1RPUllfUkVURU5USU9OX0RBWVM6IDcsXG4gIEJVQ0tFVF9QUkVGSVg6ICdiZXZ5LWFydGlmYWN0cycsXG4gIExPR19CVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMtbG9ncycsXG59IGFzIGNvbnN0O1xuY29uc3QgQUNDT1VOVF9JRF9SRUdFWCA9IC9eXFxkezEyfSQvO1xuXG4vLyDlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgpLlrprnvqnjgZfjgabjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjgpLmjpLpmaRcbmludGVyZmFjZSBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZOYW1lOiBzdHJpbmc7XG59XG5cbi8vIOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5leHBvcnQgY2xhc3MgU2Vjb25kYXJ5QnVja2V0U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzKSB7XG4gICAgY29uc3QgaGFzRXhwbGljaXRBY2NvdW50ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3BzLmVudiA/PyB7fSwgJ2FjY291bnQnKTtcbiAgICBjb25zdCBleHBsaWNpdEFjY291bnQgPSBwcm9wcy5lbnY/LmFjY291bnQ7XG4gICAgaWYgKCFoYXNFeHBsaWNpdEFjY291bnQgfHwgIWV4cGxpY2l0QWNjb3VudCB8fCAhQUNDT1VOVF9JRF9SRUdFWC50ZXN0KGV4cGxpY2l0QWNjb3VudCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ2Vudi5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC4gU2V0IENES19ERUZBVUxUX0FDQ09VTlQgYmVmb3JlIHN5bnRoL2RlcGxveS4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1TMSDlr77nrZY6XG4gICAgLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw5L+d5a2Y5YWI44Go44GX44Gm5bCC55So44OQ44Kx44OD44OI44KS55So5oSP44GZ44KL44CCXG4gICAgLy8g44Ot44Kw44OQ44Kx44OD44OI6Ieq5L2T44Gv44CM44Ot44Kw44Gu5Y+X44GR55q/44CN55So6YCU44Gu44Gf44KB44CB44ON44K544OI44GX44Gf44Ki44Kv44K744K544Ot44Kw44Gv6Kit5a6a44GX44Gq44GE44CCXG4gICAgY29uc3Qgc2Vjb25kYXJ5QWNjZXNzTG9nQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QWNjZXNzTG9nQnVja2V0U2Vjb25kYXJ5Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuTE9HX0JVQ0tFVF9QUkVGSVh9LSR7cHJvcHMuZW52TmFtZX0tc2Vjb25kYXJ5LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcbiAgICAvLyBjZGstbmFn44Gn44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr5a++44GZ44KL6K2m5ZGK44KS5oqR5Yi277yI44GT44Gu44OQ44Kx44OD44OI44Gv44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB77yJXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgc2Vjb25kYXJ5QWNjZXNzTG9nQnVja2V0LFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgLy8gIOOBk+OBruODkOOCseODg+ODiOOBr+OCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruOCouOCr+OCu+OCueODreOCsOWwgueUqOOBp+OAgeOBleOCieOBq+OCouOCr+OCu+OCueODreOCsOOBruODjeOCueODiOOCkumBv+OBkeOCi+OBn+OCgeOBq+OCteODvOODkOODvOOCouOCr+OCu+OCueODreOCsOOCkueEoeWKueOBq+OBl+OBpuOBhOOCi+OBn+OCgeOAgUF3c1NvbHV0aW9ucy1TMSDjga7orablkYrjgpLmipHliLbjgZnjgovjgIJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1TMScsXG4gICAgICAgICAgLy8g44Gq44GK44CB44GT44Gu44OQ44Kx44OD44OI44Gv44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB44CBQXdzU29sdXRpb25zLVMxIOOBruitpuWRiuOCkuaKkeWItuOBmeOCi+OAglxuICAgICAgICAgIHJlYXNvbjogJ1RoaXMgYnVja2V0IHN0b3JlcyBTMyBhY2Nlc3MgbG9ncyBmb3IgQmV2eUFydGlmYWN0QnVja2V0U2Vjb25kYXJ5IGFuZCBkb2VzIG5vdCByZXF1aXJlIG5lc3RlZCBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcuJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICAvLyDnkrDlooPlkI3jgajjgqLjgqvjgqbjg7Pjg4hJROOCkue1hOOBv+WQiOOCj+OBm+OBpuS4gOaEj+aAp+OCkuaLheS/nVxuICAgIGNvbnN0IHNlY29uZGFyeUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldFNlY29uZGFyeScsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7cHJvcHMuZW52TmFtZX0tc2Vjb25kYXJ5LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgLy8gQXdzU29sdXRpb25zLVMxMCDlr77nrZY6XG4gICAgICAvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgavjgoIgSFRUUFMoVExTKSDjga7jgb/jgpLoqLHlj6/jgZnjgovjg53jg6rjgrfjg7zjgpLlvLfliLbjgZnjgovjgIJcbiAgICAgIC8vIENESyDjgYzjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgavjgIxhd3M6U2VjdXJlVHJhbnNwb3J0PWZhbHNlIOOCkiBEZW5544CN44GZ44KL44Or44O844Or44KS6Ieq5YuV55Sf5oiQ44GZ44KL44CCXG4gICAgICAvLyDjg5fjg6njgqTjg57jg6rjg5DjgrHjg4Pjg4jvvIhCZXZ5QXJ0aWZhY3RCdWNrZXTvvInjgajlkIzkuIDmlrnph53jgpLpgannlKjjgZnjgovjgIJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEg5a++562WOlxuICAgICAgLy8g44K744Kr44Oz44OA44Oq5pys5L2T44OQ44Kx44OD44OI44Gu44Ki44Kv44K744K544Ot44Kw44KS5bCC55So44Ot44Kw44OQ44Kx44OD44OI44G45Ye65Yqb44GZ44KL44CCXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiBzZWNvbmRhcnlBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0V4cGlyZU9sZEJ1aWxkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5ISVNUT1JZX1JFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmJ1Y2tldE5hbWUgPSBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZTtcblxuICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruWQjeWJjeOCkkNsb3VkRm9ybWF0aW9u5Ye65Yqb44Gr6L+95Yqg44GX44Gm44CB44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gn5Y+C54Wn44Gn44GN44KL44KI44GG44Gr44GZ44KLXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY29uZGFyeUJ1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==