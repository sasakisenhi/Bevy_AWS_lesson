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
const validators_1 = require("./validators");
const s3_buckets_1 = require("./s3-buckets");
const stack_validators_1 = require("./stack-validators");
const stack_outputs_1 = require("./stack-outputs");
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
class SecondaryBucketStack extends cdk.Stack {
    bucketName;
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に設定されているかを検証
        (0, validators_1.validateExplicitStackAccount)(props.env);
        super(scope, id, props);
        const { artifactBucket: secondaryBucket } = (0, s3_buckets_1.createSecondaryArtifactBuckets)(this, props.envName, this.account);
        this.bucketName = secondaryBucket.bucketName;
        (0, stack_outputs_1.addSecondaryStackOutputs)({
            scope: this,
            secondaryBucket,
        });
        (0, stack_validators_1.registerSecondaryStackValidation)({
            scope: this,
            envName: props.envName,
        });
    }
}
exports.SecondaryBucketStack = SecondaryBucketStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLDZDQUE0RDtBQUM1RCw2Q0FBOEQ7QUFDOUQseURBQXNFO0FBQ3RFLG1EQUEyRDtBQU8zRCx1Q0FBdUM7QUFDdkMsTUFBYSxvQkFBcUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNqQyxVQUFVLENBQVM7SUFFbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSw2QkFBNkI7UUFDN0IsSUFBQSx5Q0FBNEIsRUFBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFeEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsR0FBRyxJQUFBLDJDQUE4QixFQUFDLElBQUksRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5RyxJQUFJLENBQUMsVUFBVSxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUM7UUFFN0MsSUFBQSx3Q0FBd0IsRUFBQztZQUN2QixLQUFLLEVBQUUsSUFBSTtZQUNYLGVBQWU7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsSUFBQSxtREFBZ0MsRUFBQztZQUMvQixLQUFLLEVBQUUsSUFBSTtZQUNYLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztTQUN2QixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2QkQsb0RBdUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgdmFsaWRhdGVFeHBsaWNpdFN0YWNrQWNjb3VudCB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5pbXBvcnQgeyBjcmVhdGVTZWNvbmRhcnlBcnRpZmFjdEJ1Y2tldHMgfSBmcm9tICcuL3MzLWJ1Y2tldHMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJTZWNvbmRhcnlTdGFja1ZhbGlkYXRpb24gfSBmcm9tICcuL3N0YWNrLXZhbGlkYXRvcnMnO1xuaW1wb3J0IHsgYWRkU2Vjb25kYXJ5U3RhY2tPdXRwdXRzIH0gZnJvbSAnLi9zdGFjay1vdXRwdXRzJztcblxuLy8g5a6a5pWw44Kq44OW44K444Kn44Kv44OI44KS5a6a576p44GX44Gm44Oe44K444OD44Kv44OK44Oz44OQ44O844KS5o6S6ZmkXG5pbnRlcmZhY2UgU2Vjb25kYXJ5QnVja2V0U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52TmFtZTogc3RyaW5nO1xufVxuXG4vLyDjgrvjgqvjg7Pjg4Djg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkOOBmeOCi+OCueOCv+ODg+OCr1xuZXhwb3J0IGNsYXNzIFNlY29uZGFyeUJ1Y2tldFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldE5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2Vjb25kYXJ5QnVja2V0U3RhY2tQcm9wcykge1xuICAgIC8vIEFXU+OCouOCq+OCpuODs+ODiElE44GM5piO56S655qE44Gr6Kit5a6a44GV44KM44Gm44GE44KL44GL44KS5qSc6Ki8XG4gICAgdmFsaWRhdGVFeHBsaWNpdFN0YWNrQWNjb3VudChwcm9wcy5lbnYpO1xuXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGFydGlmYWN0QnVja2V0OiBzZWNvbmRhcnlCdWNrZXQgfSA9IGNyZWF0ZVNlY29uZGFyeUFydGlmYWN0QnVja2V0cyh0aGlzLCBwcm9wcy5lbnZOYW1lLCB0aGlzLmFjY291bnQpO1xuXG4gICAgdGhpcy5idWNrZXROYW1lID0gc2Vjb25kYXJ5QnVja2V0LmJ1Y2tldE5hbWU7XG5cbiAgICBhZGRTZWNvbmRhcnlTdGFja091dHB1dHMoe1xuICAgICAgc2NvcGU6IHRoaXMsXG4gICAgICBzZWNvbmRhcnlCdWNrZXQsXG4gICAgfSk7XG5cbiAgICByZWdpc3RlclNlY29uZGFyeVN0YWNrVmFsaWRhdGlvbih7XG4gICAgICBzY29wZTogdGhpcyxcbiAgICAgIGVudk5hbWU6IHByb3BzLmVudk5hbWUsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==