"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPrimaryStackValidation = registerPrimaryStackValidation;
exports.registerSecondaryStackValidation = registerSecondaryStackValidation;
const config_1 = require("./config");
const validators_1 = require("./validators");
function registerPrimaryStackValidation({ scope, envName, account, githubOwner, githubRepo, secondaryBucketArn, cfnBucket, }) {
    scope.node.addValidation({
        validate: () => {
            const errors = [];
            if (!config_1.ENV_NAME_REGEX.test(envName)) {
                errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
            }
            if (envName === 'prod' &&
                (githubOwner === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
                    githubRepo === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO)) {
                errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
            }
            const expectedSecondaryBucketName = `${config_1.STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${account}`;
            const secondaryBucketName = (0, validators_1.toBucketNameFromArn)(secondaryBucketArn);
            if (secondaryBucketName !== expectedSecondaryBucketName) {
                errors.push(`secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`);
            }
            const replicationConfig = cfnBucket.replicationConfiguration;
            if (!replicationConfig?.role) {
                errors.push('S3 replication configuration must include a role ARN.');
            }
            const replicationRules = replicationConfig?.rules;
            if (!Array.isArray(replicationRules) || replicationRules.length === 0) {
                errors.push('S3 replication configuration must include at least one enabled rule.');
            }
            return errors;
        },
    });
}
function registerSecondaryStackValidation({ scope, envName, }) {
    scope.node.addValidation({
        validate: () => {
            const errors = [];
            if (!config_1.ENV_NAME_REGEX.test(envName)) {
                errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
            }
            return errors;
        },
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2stdmFsaWRhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWNrLXZhbGlkYXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFxQkEsd0VBK0NDO0FBRUQsNEVBYUM7QUFoRkQscUNBQThFO0FBQzlFLDZDQUFtRDtBQWlCbkQsU0FBZ0IsOEJBQThCLENBQUMsRUFDN0MsS0FBSyxFQUNMLE9BQU8sRUFDUCxPQUFPLEVBQ1AsV0FBVyxFQUNYLFVBQVUsRUFDVixrQkFBa0IsRUFDbEIsU0FBUyxHQUNtQjtJQUM1QixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUN2QixRQUFRLEVBQUUsR0FBYSxFQUFFO1lBQ3ZCLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztZQUU1QixJQUFJLENBQUMsdUJBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLElBQUksQ0FBQyxvRkFBb0YsQ0FBQyxDQUFDO1lBQ3BHLENBQUM7WUFFRCxJQUNFLE9BQU8sS0FBSyxNQUFNO2dCQUNsQixDQUNFLFdBQVcsS0FBSywyQkFBa0IsQ0FBQyxpQkFBaUI7b0JBQ3BELFVBQVUsS0FBSywyQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FDbkQsRUFDRCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMscUdBQXFHLENBQUMsQ0FBQztZQUNySCxDQUFDO1lBRUQsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLHVCQUFjLENBQUMsYUFBYSxJQUFJLE9BQU8sY0FBYyxPQUFPLEVBQUUsQ0FBQztZQUN0RyxNQUFNLG1CQUFtQixHQUFHLElBQUEsZ0NBQW1CLEVBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNwRSxJQUFJLG1CQUFtQixLQUFLLDJCQUEyQixFQUFFLENBQUM7Z0JBQ3hELE1BQU0sQ0FBQyxJQUFJLENBQ1Qsa0NBQWtDLDJCQUEyQixxQ0FBcUMsbUJBQW1CLEdBQUcsQ0FDekgsQ0FBQztZQUNKLENBQUM7WUFFRCxNQUFNLGlCQUFpQixHQUFHLFNBQVMsQ0FBQyx3QkFBcUYsQ0FBQztZQUMxSCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sQ0FBQyxJQUFJLENBQUMsdURBQXVELENBQUMsQ0FBQztZQUN2RSxDQUFDO1lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsRUFBRSxLQUFLLENBQUM7WUFDbEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0VBQXNFLENBQUMsQ0FBQztZQUN0RixDQUFDO1lBRUQsT0FBTyxNQUFNLENBQUM7UUFDaEIsQ0FBQztLQUNGLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFnQixnQ0FBZ0MsQ0FBQyxFQUMvQyxLQUFLLEVBQ0wsT0FBTyxHQUN1QjtJQUM5QixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUN2QixRQUFRLEVBQUUsR0FBYSxFQUFFO1lBQ3ZCLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsdUJBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLElBQUksQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFDO1lBQ2hHLENBQUM7WUFDRCxPQUFPLE1BQU0sQ0FBQztRQUNoQixDQUFDO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcblxuaW1wb3J0IHsgRU5WX05BTUVfUkVHRVgsIEdJVEhVQl9PSURDX0NPTkZJRywgU1RPUkFHRV9DT05GSUcgfSBmcm9tICcuL2NvbmZpZyc7XG5pbXBvcnQgeyB0b0J1Y2tldE5hbWVGcm9tQXJuIH0gZnJvbSAnLi92YWxpZGF0b3JzJztcblxuZXhwb3J0IGludGVyZmFjZSBQcmltYXJ5U3RhY2tWYWxpZGF0aW9uUHJvcHMge1xuICBzY29wZTogQ29uc3RydWN0O1xuICBlbnZOYW1lOiBzdHJpbmc7XG4gIGFjY291bnQ6IHN0cmluZztcbiAgZ2l0aHViT3duZXI6IHN0cmluZztcbiAgZ2l0aHViUmVwbzogc3RyaW5nO1xuICBzZWNvbmRhcnlCdWNrZXRBcm46IHN0cmluZztcbiAgY2ZuQnVja2V0OiBzMy5DZm5CdWNrZXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vjb25kYXJ5U3RhY2tWYWxpZGF0aW9uUHJvcHMge1xuICBzY29wZTogQ29uc3RydWN0O1xuICBlbnZOYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclByaW1hcnlTdGFja1ZhbGlkYXRpb24oe1xuICBzY29wZSxcbiAgZW52TmFtZSxcbiAgYWNjb3VudCxcbiAgZ2l0aHViT3duZXIsXG4gIGdpdGh1YlJlcG8sXG4gIHNlY29uZGFyeUJ1Y2tldEFybixcbiAgY2ZuQnVja2V0LFxufTogUHJpbWFyeVN0YWNrVmFsaWRhdGlvblByb3BzKTogdm9pZCB7XG4gIHNjb3BlLm5vZGUuYWRkVmFsaWRhdGlvbih7XG4gICAgdmFsaWRhdGU6ICgpOiBzdHJpbmdbXSA9PiB7XG4gICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgIGlmICghRU5WX05BTUVfUkVHRVgudGVzdChlbnZOYW1lKSkge1xuICAgICAgICBlcnJvcnMucHVzaCgnZW52IGNvbnRleHQgbXVzdCBiZSBvbmUgb2YgZGV2LCB0ZXN0LCBzdGcsIHByb2QgZm9yIG5hbWluZyBhbmQgcG9saWN5IGNvbnNpc3RlbmN5LicpO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIGVudk5hbWUgPT09ICdwcm9kJyAmJlxuICAgICAgICAoXG4gICAgICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgICAgIGdpdGh1YlJlcG8gPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBlcnJvcnMucHVzaCgnSW4gZW52PXByb2QsIGdpdGh1Yk93bmVyIGFuZCBnaXRodWJSZXBvIHBsYWNlaG9sZGVycyBhcmUgbm90IGFsbG93ZWQuIFBhc3MgZXhwbGljaXQgY29udGV4dCB2YWx1ZXMuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4cGVjdGVkU2Vjb25kYXJ5QnVja2V0TmFtZSA9IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7ZW52TmFtZX0tc2Vjb25kYXJ5LSR7YWNjb3VudH1gO1xuICAgICAgY29uc3Qgc2Vjb25kYXJ5QnVja2V0TmFtZSA9IHRvQnVja2V0TmFtZUZyb21Bcm4oc2Vjb25kYXJ5QnVja2V0QXJuKTtcbiAgICAgIGlmIChzZWNvbmRhcnlCdWNrZXROYW1lICE9PSBleHBlY3RlZFNlY29uZGFyeUJ1Y2tldE5hbWUpIHtcbiAgICAgICAgZXJyb3JzLnB1c2goXG4gICAgICAgICAgYHNlY29uZGFyeUJ1Y2tldEFybiBtdXN0IHRhcmdldCAke2V4cGVjdGVkU2Vjb25kYXJ5QnVja2V0TmFtZX0gZm9yIGVudi9hY2NvdW50IGNvbnNpc3RlbmN5OyBnb3QgJHtzZWNvbmRhcnlCdWNrZXROYW1lfS5gLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXBsaWNhdGlvbkNvbmZpZyA9IGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gYXMgczMuQ2ZuQnVja2V0LlJlcGxpY2F0aW9uQ29uZmlndXJhdGlvblByb3BlcnR5IHwgdW5kZWZpbmVkO1xuICAgICAgaWYgKCFyZXBsaWNhdGlvbkNvbmZpZz8ucm9sZSkge1xuICAgICAgICBlcnJvcnMucHVzaCgnUzMgcmVwbGljYXRpb24gY29uZmlndXJhdGlvbiBtdXN0IGluY2x1ZGUgYSByb2xlIEFSTi4nKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcGxpY2F0aW9uUnVsZXMgPSByZXBsaWNhdGlvbkNvbmZpZz8ucnVsZXM7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVwbGljYXRpb25SdWxlcykgfHwgcmVwbGljYXRpb25SdWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZXJyb3JzLnB1c2goJ1MzIHJlcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gbXVzdCBpbmNsdWRlIGF0IGxlYXN0IG9uZSBlbmFibGVkIHJ1bGUuJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfSxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNlY29uZGFyeVN0YWNrVmFsaWRhdGlvbih7XG4gIHNjb3BlLFxuICBlbnZOYW1lLFxufTogU2Vjb25kYXJ5U3RhY2tWYWxpZGF0aW9uUHJvcHMpOiB2b2lkIHtcbiAgc2NvcGUubm9kZS5hZGRWYWxpZGF0aW9uKHtcbiAgICB2YWxpZGF0ZTogKCk6IHN0cmluZ1tdID0+IHtcbiAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmICghRU5WX05BTUVfUkVHRVgudGVzdChlbnZOYW1lKSkge1xuICAgICAgICBlcnJvcnMucHVzaCgnZW52TmFtZSBtdXN0IGJlIG9uZSBvZiBkZXYsIHRlc3QsIHN0ZywgcHJvZCBmb3IgbmFtaW5nIGFuZCBwb2xpY3kgY29uc2lzdGVuY3kuJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZXJyb3JzO1xuICAgIH0sXG4gIH0pO1xufVxuIl19