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
exports.addPrimaryStackOutputs = addPrimaryStackOutputs;
exports.addSecondaryStackOutputs = addSecondaryStackOutputs;
const cdk = __importStar(require("aws-cdk-lib"));
// プライマリスタックの出力を追加する関数を定義。これには、アーティファクトバケットの名前、GitHub ActionsロールのARN、およびセカンダリバケットのARNが含まれる。
function addPrimaryStackOutputs({ scope, artifactBucket, githubRole, codeBuildServiceRole, secondaryBucketArn, }) {
    new cdk.CfnOutput(scope, 'BucketNameExport', {
        value: artifactBucket.bucketName,
    });
    // GitHub ActionsロールのARNを出力する。これにより、GitHub ActionsがプライマリバケットにアクセスするためのIAMロールのARNが提供される。
    new cdk.CfnOutput(scope, 'GithubActionsRoleArn', {
        value: githubRole.roleArn,
    });
    // 将来のCodeBuild移行に備えたサービスロールARNを出力する。
    new cdk.CfnOutput(scope, 'CodeBuildServiceRoleArn', {
        value: codeBuildServiceRole.roleArn,
    });
    // セカンダリバケットのARNを出力する。これにより、クロスリージョンレプリケーションの宛先バケットのARNが提供される。
    new cdk.CfnOutput(scope, 'ReplicationDestinationBucketArn', {
        value: secondaryBucketArn,
    });
}
// セカンダリスタックの出力を追加する関数を定義。これには、セカンダリバケットの名前が含まれる。
function addSecondaryStackOutputs({ scope, secondaryBucket, }) {
    new cdk.CfnOutput(scope, 'SecondaryBucketNameExport', {
        value: secondaryBucket.bucketName,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2stb3V0cHV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWNrLW91dHB1dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFxQkEsd0RBc0JDO0FBR0QsNERBT0M7QUFyREQsaURBQW1DO0FBb0JuQywyRkFBMkY7QUFDM0YsU0FBZ0Isc0JBQXNCLENBQUMsRUFDckMsS0FBSyxFQUNMLGNBQWMsRUFDZCxVQUFVLEVBQ1Ysb0JBQW9CLEVBQ3BCLGtCQUFrQixHQUNNO0lBQ3hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUU7UUFDM0MsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVO0tBQ2pDLENBQUMsQ0FBQztJQUNMLHVGQUF1RjtJQUNyRixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLHNCQUFzQixFQUFFO1FBQy9DLEtBQUssRUFBRSxVQUFVLENBQUMsT0FBTztLQUMxQixDQUFDLENBQUM7SUFDTCxxQ0FBcUM7SUFDbkMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSx5QkFBeUIsRUFBRTtRQUNsRCxLQUFLLEVBQUUsb0JBQW9CLENBQUMsT0FBTztLQUNwQyxDQUFDLENBQUM7SUFDTCw4REFBOEQ7SUFDNUQsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxpQ0FBaUMsRUFBRTtRQUMxRCxLQUFLLEVBQUUsa0JBQWtCO0tBQzFCLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxpREFBaUQ7QUFDakQsU0FBZ0Isd0JBQXdCLENBQUMsRUFDdkMsS0FBSyxFQUNMLGVBQWUsR0FDVztJQUMxQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLDJCQUEyQixFQUFFO1FBQ3BELEtBQUssRUFBRSxlQUFlLENBQUMsVUFBVTtLQUNsQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLy8g44K544K/44OD44Kv44Gu5Ye65Yqb44KS6L+95Yqg44GZ44KL6Zai5pWw44Go6Zai6YCj44GZ44KL44Kk44Oz44K/44O844OV44Kn44O844K544KS5a6a576pXG5leHBvcnQgaW50ZXJmYWNlIFByaW1hcnlTdGFja091dHB1dFByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgYXJ0aWZhY3RCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIGdpdGh1YlJvbGU6IGlhbS5JUm9sZTtcbiAgY29kZUJ1aWxkU2VydmljZVJvbGU6IGlhbS5JUm9sZTtcbiAgc2Vjb25kYXJ5QnVja2V0QXJuOiBzdHJpbmc7XG59XG5cbi8vIOOCueOCv+ODg+OCr+OBruWHuuWKm+OCkui/veWKoOOBmeOCi+mWouaVsOOBqOmWoumAo+OBmeOCi+OCpOODs+OCv+ODvOODleOCp+ODvOOCueOCkuWumue+qVxuZXhwb3J0IGludGVyZmFjZSBTZWNvbmRhcnlTdGFja091dHB1dFByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgc2Vjb25kYXJ5QnVja2V0OiBzMy5JQnVja2V0O1xufVxuXG4vLyDjg5fjg6njgqTjg57jg6rjgrnjgr/jg4Pjgq/jga7lh7rlipvjgpLov73liqDjgZnjgovplqLmlbDjgpLlrprnvqnjgILjgZPjgozjgavjga/jgIHjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jjg5DjgrHjg4Pjg4jjga7lkI3liY3jgIFHaXRIdWIgQWN0aW9uc+ODreODvOODq+OBrkFSTuOAgeOBiuOCiOOBs+OCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOBjOWQq+OBvuOCjOOCi+OAglxuZXhwb3J0IGZ1bmN0aW9uIGFkZFByaW1hcnlTdGFja091dHB1dHMoe1xuICBzY29wZSxcbiAgYXJ0aWZhY3RCdWNrZXQsXG4gIGdpdGh1YlJvbGUsXG4gIGNvZGVCdWlsZFNlcnZpY2VSb2xlLFxuICBzZWNvbmRhcnlCdWNrZXRBcm4sXG59OiBQcmltYXJ5U3RhY2tPdXRwdXRQcm9wcyk6IHZvaWQge1xuICBuZXcgY2RrLkNmbk91dHB1dChzY29wZSwgJ0J1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgdmFsdWU6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gIH0pO1xuLy8gR2l0SHViIEFjdGlvbnPjg63jg7zjg6vjga5BUk7jgpLlh7rlipvjgZnjgovjgILjgZPjgozjgavjgojjgorjgIFHaXRIdWIgQWN0aW9uc+OBjOODl+ODqeOCpOODnuODquODkOOCseODg+ODiOOBq+OCouOCr+OCu+OCueOBmeOCi+OBn+OCgeOBrklBTeODreODvOODq+OBrkFSTuOBjOaPkOS+m+OBleOCjOOCi+OAglxuICBuZXcgY2RrLkNmbk91dHB1dChzY29wZSwgJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge1xuICAgIHZhbHVlOiBnaXRodWJSb2xlLnJvbGVBcm4sXG4gIH0pO1xuLy8g5bCG5p2l44GuQ29kZUJ1aWxk56e76KGM44Gr5YKZ44GI44Gf44K144O844OT44K544Ot44O844OrQVJO44KS5Ye65Yqb44GZ44KL44CCXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHNjb3BlLCAnQ29kZUJ1aWxkU2VydmljZVJvbGVBcm4nLCB7XG4gICAgdmFsdWU6IGNvZGVCdWlsZFNlcnZpY2VSb2xlLnJvbGVBcm4sXG4gIH0pO1xuLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS5Ye65Yqb44GZ44KL44CC44GT44KM44Gr44KI44KK44CB44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gu5a6b5YWI44OQ44Kx44OD44OI44GuQVJO44GM5o+Q5L6b44GV44KM44KL44CCXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHNjb3BlLCAnUmVwbGljYXRpb25EZXN0aW5hdGlvbkJ1Y2tldEFybicsIHtcbiAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0QXJuLFxuICB9KTtcbn1cblxuLy8g44K744Kr44Oz44OA44Oq44K544K/44OD44Kv44Gu5Ye65Yqb44KS6L+95Yqg44GZ44KL6Zai5pWw44KS5a6a576p44CC44GT44KM44Gr44Gv44CB44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu5ZCN5YmN44GM5ZCr44G+44KM44KL44CCXG5leHBvcnQgZnVuY3Rpb24gYWRkU2Vjb25kYXJ5U3RhY2tPdXRwdXRzKHtcbiAgc2NvcGUsXG4gIHNlY29uZGFyeUJ1Y2tldCxcbn06IFNlY29uZGFyeVN0YWNrT3V0cHV0UHJvcHMpOiB2b2lkIHtcbiAgbmV3IGNkay5DZm5PdXRwdXQoc2NvcGUsICdTZWNvbmRhcnlCdWNrZXROYW1lRXhwb3J0Jywge1xuICAgIHZhbHVlOiBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZSxcbiAgfSk7XG59XG4iXX0=