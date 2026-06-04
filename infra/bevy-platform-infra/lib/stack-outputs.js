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
function addPrimaryStackOutputs({ scope, artifactBucket, githubRole, secondaryBucketArn, }) {
    new cdk.CfnOutput(scope, 'BucketNameExport', {
        value: artifactBucket.bucketName,
    });
    new cdk.CfnOutput(scope, 'GithubActionsRoleArn', {
        value: githubRole.roleArn,
    });
    new cdk.CfnOutput(scope, 'ReplicationDestinationBucketArn', {
        value: secondaryBucketArn,
    });
}
function addSecondaryStackOutputs({ scope, secondaryBucket, }) {
    new cdk.CfnOutput(scope, 'SecondaryBucketNameExport', {
        value: secondaryBucket.bucketName,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2stb3V0cHV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWNrLW91dHB1dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpQkEsd0RBaUJDO0FBRUQsNERBT0M7QUEzQ0QsaURBQW1DO0FBaUJuQyxTQUFnQixzQkFBc0IsQ0FBQyxFQUNyQyxLQUFLLEVBQ0wsY0FBYyxFQUNkLFVBQVUsRUFDVixrQkFBa0IsR0FDTTtJQUN4QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFO1FBQzNDLEtBQUssRUFBRSxjQUFjLENBQUMsVUFBVTtLQUNqQyxDQUFDLENBQUM7SUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLHNCQUFzQixFQUFFO1FBQy9DLEtBQUssRUFBRSxVQUFVLENBQUMsT0FBTztLQUMxQixDQUFDLENBQUM7SUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGlDQUFpQyxFQUFFO1FBQzFELEtBQUssRUFBRSxrQkFBa0I7S0FDMUIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQWdCLHdCQUF3QixDQUFDLEVBQ3ZDLEtBQUssRUFDTCxlQUFlLEdBQ1c7SUFDMUIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSwyQkFBMkIsRUFBRTtRQUNwRCxLQUFLLEVBQUUsZUFBZSxDQUFDLFVBQVU7S0FDbEMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpbWFyeVN0YWNrT3V0cHV0UHJvcHMge1xuICBzY29wZTogQ29uc3RydWN0O1xuICBhcnRpZmFjdEJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgZ2l0aHViUm9sZTogaWFtLklSb2xlO1xuICBzZWNvbmRhcnlCdWNrZXRBcm46IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWNvbmRhcnlTdGFja091dHB1dFByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgc2Vjb25kYXJ5QnVja2V0OiBzMy5JQnVja2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkUHJpbWFyeVN0YWNrT3V0cHV0cyh7XG4gIHNjb3BlLFxuICBhcnRpZmFjdEJ1Y2tldCxcbiAgZ2l0aHViUm9sZSxcbiAgc2Vjb25kYXJ5QnVja2V0QXJuLFxufTogUHJpbWFyeVN0YWNrT3V0cHV0UHJvcHMpOiB2b2lkIHtcbiAgbmV3IGNkay5DZm5PdXRwdXQoc2NvcGUsICdCdWNrZXROYW1lRXhwb3J0Jywge1xuICAgIHZhbHVlOiBhcnRpZmFjdEJ1Y2tldC5idWNrZXROYW1lLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzY29wZSwgJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge1xuICAgIHZhbHVlOiBnaXRodWJSb2xlLnJvbGVBcm4sXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHNjb3BlLCAnUmVwbGljYXRpb25EZXN0aW5hdGlvbkJ1Y2tldEFybicsIHtcbiAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0QXJuLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFNlY29uZGFyeVN0YWNrT3V0cHV0cyh7XG4gIHNjb3BlLFxuICBzZWNvbmRhcnlCdWNrZXQsXG59OiBTZWNvbmRhcnlTdGFja091dHB1dFByb3BzKTogdm9pZCB7XG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHNjb3BlLCAnU2Vjb25kYXJ5QnVja2V0TmFtZUV4cG9ydCcsIHtcbiAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0LmJ1Y2tldE5hbWUsXG4gIH0pO1xufVxuIl19