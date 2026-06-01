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
// 定数オブジェクトを定義してマジックナンバーを排除
const config_1 = require("./config");
const validators_1 = require("./validators");
const s3_buckets_1 = require("./s3-buckets");
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
class SecondaryBucketStack extends cdk.Stack {
    bucketName;
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に設定されているかを検証
        (0, validators_1.validateExplicitStackAccount)(props.env);
        super(scope, id, props);
        const { artifactBucket: secondaryBucket } = (0, s3_buckets_1.createSecondaryArtifactBuckets)(this, props.envName, this.account);
        this.bucketName = secondaryBucket.bucketName;
        // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
        new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
            value: secondaryBucket.bucketName,
        });
        this.node.addValidation({
            // スタック全体のバリデーションルールを定義
            validate: () => {
                const errors = [];
                // 環境名のバリデーション
                if (!config_1.ENV_NAME_REGEX.test(props.envName)) {
                    errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
                }
                return errors;
            },
        });
    }
}
exports.SecondaryBucketStack = SecondaryBucketStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLDJCQUEyQjtBQUMzQixxQ0FBMEM7QUFDMUMsNkNBQTREO0FBQzVELDZDQUE4RDtBQU85RCx1Q0FBdUM7QUFDdkMsTUFBYSxvQkFBcUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNqQyxVQUFVLENBQVM7SUFFbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSw2QkFBNkI7UUFDN0IsSUFBQSx5Q0FBNEIsRUFBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFeEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsR0FBRyxJQUFBLDJDQUE4QixFQUFDLElBQUksRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5RyxJQUFJLENBQUMsVUFBVSxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUM7UUFFN0MsMERBQTBEO1FBQzFELElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDbkQsS0FBSyxFQUFFLGVBQWUsQ0FBQyxVQUFVO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3RCLHVCQUF1QjtZQUN2QixRQUFRLEVBQUUsR0FBYSxFQUFFO2dCQUN2QixNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7Z0JBQzVCLGNBQWM7Z0JBQ2QsSUFBSSxDQUFDLHVCQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLGdGQUFnRixDQUFDLENBQUM7Z0JBQ2hHLENBQUM7Z0JBRUQsT0FBTyxNQUFNLENBQUM7WUFDaEIsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9CRCxvREErQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG4vLyDlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgpLlrprnvqnjgZfjgabjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjgpLmjpLpmaRcbmltcG9ydCB7IEVOVl9OQU1FX1JFR0VYIH0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHsgdmFsaWRhdGVFeHBsaWNpdFN0YWNrQWNjb3VudCB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5pbXBvcnQgeyBjcmVhdGVTZWNvbmRhcnlBcnRpZmFjdEJ1Y2tldHMgfSBmcm9tICcuL3MzLWJ1Y2tldHMnO1xuXG4vLyDlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgpLlrprnvqnjgZfjgabjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjgpLmjpLpmaRcbmludGVyZmFjZSBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZOYW1lOiBzdHJpbmc7XG59XG5cbi8vIOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5leHBvcnQgY2xhc3MgU2Vjb25kYXJ5QnVja2V0U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzKSB7XG4gICAgLy8gQVdT44Ki44Kr44Km44Oz44OISUTjgYzmmI7npLrnmoTjgavoqK3lrprjgZXjgozjgabjgYTjgovjgYvjgpLmpJzoqLxcbiAgICB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50KHByb3BzLmVudik7XG5cbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgYXJ0aWZhY3RCdWNrZXQ6IHNlY29uZGFyeUJ1Y2tldCB9ID0gY3JlYXRlU2Vjb25kYXJ5QXJ0aWZhY3RCdWNrZXRzKHRoaXMsIHByb3BzLmVudk5hbWUsIHRoaXMuYWNjb3VudCk7XG5cbiAgICB0aGlzLmJ1Y2tldE5hbWUgPSBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZTtcblxuICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruWQjeWJjeOCkkNsb3VkRm9ybWF0aW9u5Ye65Yqb44Gr6L+95Yqg44GX44Gm44CB44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gn5Y+C54Wn44Gn44GN44KL44KI44GG44Gr44GZ44KLXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY29uZGFyeUJ1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG5cbiAgICB0aGlzLm5vZGUuYWRkVmFsaWRhdGlvbih7XG4gICAgICAvLyDjgrnjgr/jg4Pjgq/lhajkvZPjga7jg5Djg6rjg4fjg7zjgrfjg6fjg7Pjg6vjg7zjg6vjgpLlrprnvqlcbiAgICAgIHZhbGlkYXRlOiAoKTogc3RyaW5nW10gPT4ge1xuICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIC8vIOeSsOWig+WQjeOBruODkOODquODh+ODvOOCt+ODp+ODs1xuICAgICAgICBpZiAoIUVOVl9OQU1FX1JFR0VYLnRlc3QocHJvcHMuZW52TmFtZSkpIHtcbiAgICAgICAgICBlcnJvcnMucHVzaCgnZW52TmFtZSBtdXN0IGJlIG9uZSBvZiBkZXYsIHRlc3QsIHN0ZywgcHJvZCBmb3IgbmFtaW5nIGFuZCBwb2xpY3kgY29uc2lzdGVuY3kuJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JzO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufVxuIl19