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
exports.registerPrimaryStackValidation = registerPrimaryStackValidation;
exports.registerSecondaryStackValidation = registerSecondaryStackValidation;
const cdk = __importStar(require("aws-cdk-lib"));
const config_1 = require("./config");
const validators_1 = require("./validators");
// プライマリスタックのバリデーションを登録する関数を定義。これには、環境名、GitHub OIDCのコンテキスト値、およびセカンダリバケットのARNに関する検証が含まれる。
function registerPrimaryStackValidation({ scope, envName, account, githubOwner, githubRepo, secondaryBucketArn, cfnBucket, }) {
    scope.node.addValidation({
        validate: () => {
            const errors = [];
            // 環境名が dev, test, stg, prod のいずれかであることを検証
            if (!config_1.ENV_NAME_REGEX.test(envName)) {
                errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
            }
            // GitHub OIDCのコンテキスト値がプレースホルダーのままになっていないことを検証
            if (envName === 'prod' &&
                (githubOwner === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
                    githubRepo === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO)) {
                errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
            }
            const expectedSecondaryBucketName = `${config_1.STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${account}`;
            const secondaryBucketName = (0, validators_1.toBucketNameFromArn)(secondaryBucketArn);
            // セカンダリバケットARNが、envNameとaccountに基づいて予想されるバケット名を指していることを検証
            const isUnresolvedSecondaryArn = cdk.Token.isUnresolved(secondaryBucketArn) || secondaryBucketName.includes('${Token[');
            if (!isUnresolvedSecondaryArn && secondaryBucketName !== expectedSecondaryBucketName) {
                errors.push(`secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`);
            }
            // S3レプリケーションの設定が正しく構成されていることを検証
            const replicationConfig = cfnBucket.replicationConfiguration;
            if (!replicationConfig?.role) {
                errors.push('S3 replication configuration must include a role ARN.');
            }
            // レプリケーションルールが少なくとも1つ有効であることを検証
            const replicationRules = replicationConfig?.rules;
            if (!Array.isArray(replicationRules) || replicationRules.length === 0) {
                errors.push('S3 replication configuration must include at least one enabled rule.');
            }
            return errors;
        },
    });
}
// セカンダリスタックのバリデーションを登録する関数を定義。これには、環境名に関する検証が含まれる。
function registerSecondaryStackValidation({ scope, envName, }) {
    scope.node.addValidation({
        validate: () => {
            const errors = [];
            // 環境名が dev, test, stg, prod のいずれかであることを検証
            if (!config_1.ENV_NAME_REGEX.test(envName)) {
                errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
            }
            return errors;
        },
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2stdmFsaWRhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWNrLXZhbGlkYXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5QkEsd0VBbURDO0FBR0QsNEVBY0M7QUE1RkQsaURBQW1DO0FBR25DLHFDQUE4RTtBQUM5RSw2Q0FBbUQ7QUFtQm5ELHdGQUF3RjtBQUN4RixTQUFnQiw4QkFBOEIsQ0FBQyxFQUM3QyxLQUFLLEVBQ0wsT0FBTyxFQUNQLE9BQU8sRUFDUCxXQUFXLEVBQ1gsVUFBVSxFQUNWLGtCQUFrQixFQUNsQixTQUFTLEdBQ21CO0lBQzVCLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ3ZCLFFBQVEsRUFBRSxHQUFhLEVBQUU7WUFDdkIsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1lBQ2xDLDBDQUEwQztZQUNwQyxJQUFJLENBQUMsdUJBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLElBQUksQ0FBQyxvRkFBb0YsQ0FBQyxDQUFDO1lBQ3BHLENBQUM7WUFDUCw4Q0FBOEM7WUFDeEMsSUFDRSxPQUFPLEtBQUssTUFBTTtnQkFDbEIsQ0FDRSxXQUFXLEtBQUssMkJBQWtCLENBQUMsaUJBQWlCO29CQUNwRCxVQUFVLEtBQUssMkJBQWtCLENBQUMsZ0JBQWdCLENBQ25ELEVBQ0QsQ0FBQztnQkFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLHFHQUFxRyxDQUFDLENBQUM7WUFDckgsQ0FBQztZQUNELE1BQU0sMkJBQTJCLEdBQUcsR0FBRyx1QkFBYyxDQUFDLGFBQWEsSUFBSSxPQUFPLGNBQWMsT0FBTyxFQUFFLENBQUM7WUFDdEcsTUFBTSxtQkFBbUIsR0FBRyxJQUFBLGdDQUFtQixFQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDcEUsMERBQTBEO1lBQzFELE1BQU0sd0JBQXdCLEdBQzVCLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLElBQUksbUJBQW1CLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRXpGLElBQUksQ0FBQyx3QkFBd0IsSUFBSSxtQkFBbUIsS0FBSywyQkFBMkIsRUFBRSxDQUFDO2dCQUNyRixNQUFNLENBQUMsSUFBSSxDQUNULGtDQUFrQywyQkFBMkIscUNBQXFDLG1CQUFtQixHQUFHLENBQ3pILENBQUM7WUFDSixDQUFDO1lBQ1AsZ0NBQWdDO1lBQzFCLE1BQU0saUJBQWlCLEdBQUcsU0FBUyxDQUFDLHdCQUFxRixDQUFDO1lBQzFILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7WUFDRCxnQ0FBZ0M7WUFDaEMsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsRUFBRSxLQUFLLENBQUM7WUFDbEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0VBQXNFLENBQUMsQ0FBQztZQUN0RixDQUFDO1lBRUQsT0FBTyxNQUFNLENBQUM7UUFDaEIsQ0FBQztLQUNGLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxtREFBbUQ7QUFDbkQsU0FBZ0IsZ0NBQWdDLENBQUMsRUFDL0MsS0FBSyxFQUNMLE9BQU8sR0FDdUI7SUFDOUIsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDdkIsUUFBUSxFQUFFLEdBQWEsRUFBRTtZQUN2QixNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7WUFDNUIsMENBQTBDO1lBQzFDLElBQUksQ0FBQyx1QkFBYyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdGQUFnRixDQUFDLENBQUM7WUFDaEcsQ0FBQztZQUNELE9BQU8sTUFBTSxDQUFDO1FBQ2hCLENBQUM7S0FDRixDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcblxuaW1wb3J0IHsgRU5WX05BTUVfUkVHRVgsIEdJVEhVQl9PSURDX0NPTkZJRywgU1RPUkFHRV9DT05GSUcgfSBmcm9tICcuL2NvbmZpZyc7XG5pbXBvcnQgeyB0b0J1Y2tldE5hbWVGcm9tQXJuIH0gZnJvbSAnLi92YWxpZGF0b3JzJztcblxuLy8g44K544K/44OD44Kv44Gu44OQ44Oq44OH44O844K344On44Oz44KS55m76Yyy44GZ44KL6Zai5pWw44Go6Zai6YCj44GZ44KL44Kk44Oz44K/44O844OV44Kn44O844K544KS5a6a576pXG5leHBvcnQgaW50ZXJmYWNlIFByaW1hcnlTdGFja1ZhbGlkYXRpb25Qcm9wcyB7XG4gIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIGVudk5hbWU6IHN0cmluZztcbiAgYWNjb3VudDogc3RyaW5nO1xuICBnaXRodWJPd25lcjogc3RyaW5nO1xuICBnaXRodWJSZXBvOiBzdHJpbmc7XG4gIHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nO1xuICBjZm5CdWNrZXQ6IHMzLkNmbkJ1Y2tldDtcbn1cblxuLy8g44K544K/44OD44Kv44Gu44OQ44Oq44OH44O844K344On44Oz44KS55m76Yyy44GZ44KL6Zai5pWw44Go6Zai6YCj44GZ44KL44Kk44Oz44K/44O844OV44Kn44O844K544KS5a6a576pXG5leHBvcnQgaW50ZXJmYWNlIFNlY29uZGFyeVN0YWNrVmFsaWRhdGlvblByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgZW52TmFtZTogc3RyaW5nO1xufVxuXG4vLyDjg5fjg6njgqTjg57jg6rjgrnjgr/jg4Pjgq/jga7jg5Djg6rjg4fjg7zjgrfjg6fjg7PjgpLnmbvpjLLjgZnjgovplqLmlbDjgpLlrprnvqnjgILjgZPjgozjgavjga/jgIHnkrDlooPlkI3jgIFHaXRIdWIgT0lEQ+OBruOCs+ODs+ODhuOCreOCueODiOWApOOAgeOBiuOCiOOBs+OCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOBq+mWouOBmeOCi+aknOiovOOBjOWQq+OBvuOCjOOCi+OAglxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUHJpbWFyeVN0YWNrVmFsaWRhdGlvbih7XG4gIHNjb3BlLFxuICBlbnZOYW1lLFxuICBhY2NvdW50LFxuICBnaXRodWJPd25lcixcbiAgZ2l0aHViUmVwbyxcbiAgc2Vjb25kYXJ5QnVja2V0QXJuLFxuICBjZm5CdWNrZXQsXG59OiBQcmltYXJ5U3RhY2tWYWxpZGF0aW9uUHJvcHMpOiB2b2lkIHtcbiAgc2NvcGUubm9kZS5hZGRWYWxpZGF0aW9uKHtcbiAgICB2YWxpZGF0ZTogKCk6IHN0cmluZ1tdID0+IHtcbiAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbi8vIOeSsOWig+WQjeOBjCBkZXYsIHRlc3QsIHN0ZywgcHJvZCDjga7jgYTjgZrjgozjgYvjgafjgYLjgovjgZPjgajjgpLmpJzoqLxcbiAgICAgIGlmICghRU5WX05BTUVfUkVHRVgudGVzdChlbnZOYW1lKSkge1xuICAgICAgICBlcnJvcnMucHVzaCgnZW52IGNvbnRleHQgbXVzdCBiZSBvbmUgb2YgZGV2LCB0ZXN0LCBzdGcsIHByb2QgZm9yIG5hbWluZyBhbmQgcG9saWN5IGNvbnNpc3RlbmN5LicpO1xuICAgICAgfVxuLy8gR2l0SHViIE9JREPjga7jgrPjg7Pjg4bjgq3jgrnjg4jlgKTjgYzjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjga7jgb7jgb7jgavjgarjgaPjgabjgYTjgarjgYTjgZPjgajjgpLmpJzoqLxcbiAgICAgIGlmIChcbiAgICAgICAgZW52TmFtZSA9PT0gJ3Byb2QnICYmXG4gICAgICAgIChcbiAgICAgICAgICBnaXRodWJPd25lciA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSIHx8XG4gICAgICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKCdJbiBlbnY9cHJvZCwgZ2l0aHViT3duZXIgYW5kIGdpdGh1YlJlcG8gcGxhY2Vob2xkZXJzIGFyZSBub3QgYWxsb3dlZC4gUGFzcyBleHBsaWNpdCBjb250ZXh0IHZhbHVlcy4nKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGVjdGVkU2Vjb25kYXJ5QnVja2V0TmFtZSA9IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7ZW52TmFtZX0tc2Vjb25kYXJ5LSR7YWNjb3VudH1gO1xuICAgICAgY29uc3Qgc2Vjb25kYXJ5QnVja2V0TmFtZSA9IHRvQnVja2V0TmFtZUZyb21Bcm4oc2Vjb25kYXJ5QnVja2V0QXJuKTtcbiAgICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiEFSTuOBjOOAgWVudk5hbWXjgahhY2NvdW5044Gr5Z+644Gl44GE44Gm5LqI5oOz44GV44KM44KL44OQ44Kx44OD44OI5ZCN44KS5oyH44GX44Gm44GE44KL44GT44Go44KS5qSc6Ki8XG4gICAgICBjb25zdCBpc1VucmVzb2x2ZWRTZWNvbmRhcnlBcm4gPVxuICAgICAgICBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHNlY29uZGFyeUJ1Y2tldEFybikgfHwgc2Vjb25kYXJ5QnVja2V0TmFtZS5pbmNsdWRlcygnJHtUb2tlblsnKTtcblxuICAgICAgaWYgKCFpc1VucmVzb2x2ZWRTZWNvbmRhcnlBcm4gJiYgc2Vjb25kYXJ5QnVja2V0TmFtZSAhPT0gZXhwZWN0ZWRTZWNvbmRhcnlCdWNrZXROYW1lKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKFxuICAgICAgICAgIGBzZWNvbmRhcnlCdWNrZXRBcm4gbXVzdCB0YXJnZXQgJHtleHBlY3RlZFNlY29uZGFyeUJ1Y2tldE5hbWV9IGZvciBlbnYvYWNjb3VudCBjb25zaXN0ZW5jeTsgZ290ICR7c2Vjb25kYXJ5QnVja2V0TmFtZX0uYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbi8vIFMz44Os44OX44Oq44Kx44O844K344On44Oz44Gu6Kit5a6a44GM5q2j44GX44GP5qeL5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS5qSc6Ki8XG4gICAgICBjb25zdCByZXBsaWNhdGlvbkNvbmZpZyA9IGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gYXMgczMuQ2ZuQnVja2V0LlJlcGxpY2F0aW9uQ29uZmlndXJhdGlvblByb3BlcnR5IHwgdW5kZWZpbmVkO1xuICAgICAgaWYgKCFyZXBsaWNhdGlvbkNvbmZpZz8ucm9sZSkge1xuICAgICAgICBlcnJvcnMucHVzaCgnUzMgcmVwbGljYXRpb24gY29uZmlndXJhdGlvbiBtdXN0IGluY2x1ZGUgYSByb2xlIEFSTi4nKTtcbiAgICAgIH1cbiAgICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+ODq+ODvOODq+OBjOWwkeOBquOBj+OBqOOCgjHjgaTmnInlirnjgafjgYLjgovjgZPjgajjgpLmpJzoqLxcbiAgICAgIGNvbnN0IHJlcGxpY2F0aW9uUnVsZXMgPSByZXBsaWNhdGlvbkNvbmZpZz8ucnVsZXM7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVwbGljYXRpb25SdWxlcykgfHwgcmVwbGljYXRpb25SdWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZXJyb3JzLnB1c2goJ1MzIHJlcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gbXVzdCBpbmNsdWRlIGF0IGxlYXN0IG9uZSBlbmFibGVkIHJ1bGUuJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfSxcbiAgfSk7XG59XG5cbi8vIOOCu+OCq+ODs+ODgOODquOCueOCv+ODg+OCr+OBruODkOODquODh+ODvOOCt+ODp+ODs+OCkueZu+mMsuOBmeOCi+mWouaVsOOCkuWumue+qeOAguOBk+OCjOOBq+OBr+OAgeeSsOWig+WQjeOBq+mWouOBmeOCi+aknOiovOOBjOWQq+OBvuOCjOOCi+OAglxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyU2Vjb25kYXJ5U3RhY2tWYWxpZGF0aW9uKHtcbiAgc2NvcGUsXG4gIGVudk5hbWUsXG59OiBTZWNvbmRhcnlTdGFja1ZhbGlkYXRpb25Qcm9wcyk6IHZvaWQge1xuICBzY29wZS5ub2RlLmFkZFZhbGlkYXRpb24oe1xuICAgIHZhbGlkYXRlOiAoKTogc3RyaW5nW10gPT4ge1xuICAgICAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgLy8g55Kw5aKD5ZCN44GMIGRldiwgdGVzdCwgc3RnLCBwcm9kIOOBruOBhOOBmuOCjOOBi+OBp+OBguOCi+OBk+OBqOOCkuaknOiovFxuICAgICAgaWYgKCFFTlZfTkFNRV9SRUdFWC50ZXN0KGVudk5hbWUpKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKCdlbnZOYW1lIG11c3QgYmUgb25lIG9mIGRldiwgdGVzdCwgc3RnLCBwcm9kIGZvciBuYW1pbmcgYW5kIHBvbGljeSBjb25zaXN0ZW5jeS4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfSxcbiAgfSk7XG59XG4iXX0=