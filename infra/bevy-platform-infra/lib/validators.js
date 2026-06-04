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
exports.validateExplicitStackAccount = validateExplicitStackAccount;
exports.validateCdkDefaultAccount = validateCdkDefaultAccount;
exports.validateSecondaryBucketArn = validateSecondaryBucketArn;
exports.toBucketNameFromArn = toBucketNameFromArn;
exports.validateGitHubOidcContext = validateGitHubOidcContext;
const cdk = __importStar(require("aws-cdk-lib"));
const config_1 = require("./config");
// AWS CDKのスタックやリソースのプロパティに対するバリデーション関数を定義
// これらの関数は、スタックのコンストラクタ内や、CDKアプリのエントリーポイントで呼び出されることを想定している
function validateExplicitStackAccount(env) {
    const hasExplicitAccount = Object.prototype.hasOwnProperty.call(env ?? {}, 'account');
    const explicitAccount = env?.account;
    if (!hasExplicitAccount || !explicitAccount || !config_1.ACCOUNT_ID_REGEX.test(explicitAccount)) {
        throw new Error('env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.');
    }
    return explicitAccount;
}
// CDK_DEFAULT_ACCOUNTが設定されていることを検証する関数
function validateCdkDefaultAccount(account) {
    if (!account) {
        throw new Error('CDK_DEFAULT_ACCOUNT is required. Configure AWS credentials before synth/deploy.');
    }
    if (!config_1.ACCOUNT_ID_REGEX.test(account)) {
        throw new Error('CDK_DEFAULT_ACCOUNT must be a 12-digit AWS account ID.');
    }
    return account;
}
// envNameがサポートされている値であることを検証する関数
function validateSecondaryBucketArn(secondaryBucketArn) {
    // synth時点では、別スタック由来の値が未解決トークンになる場合がある
    // （例: arn:aws:s3:::${Token[TOKEN.123]})。このケースは有効として扱う。
    if (cdk.Token.isUnresolved(secondaryBucketArn)) {
        return;
    }
    if (!config_1.S3_BUCKET_ARN_REGEX.test(secondaryBucketArn)) {
        throw new Error('secondaryBucketArn must be a valid S3 bucket ARN (e.g. arn:aws:s3:::my-bucket).');
    }
}
// S3バケットARNからバケット名を抽出する関数
function toBucketNameFromArn(bucketArn) {
    return bucketArn.replace('arn:aws:s3:::', '');
}
// GitHub OIDC関連のコンテキスト値を検証する関数
function validateGitHubOidcContext(githubOwner, githubRepo, githubBranch) {
    if (githubOwner !== undefined && !config_1.GITHUB_OWNER_REGEX.test(githubOwner)) {
        throw new Error('githubOwner must contain only letters, numbers, and hyphens.');
    }
    // githubRepoは、GitHubのリポジトリ名として有効な文字（英数字、ドット、アンダースコア、ハイフン）を含む必要がある
    if (githubRepo !== undefined && !config_1.GITHUB_REPO_REGEX.test(githubRepo)) {
        throw new Error('githubRepo must contain only letters, numbers, dots, underscores, and hyphens.');
    }
    // githubBranchは、GitHubのブランチ名として有効な文字（英数字、ドット、アンダースコア、ハイフン、スラッシュ）を含む必要がある。また、ワイルドカード文字（*、?、[）を含んではいけない。
    if (githubBranch !== undefined) {
        if (githubBranch.length === 0) {
            throw new Error('githubBranch must not be empty.');
        }
        // ワイルドカード文字を含むブランチ名はサポートしないため、エラーをスローする
        if (config_1.GITHUB_BRANCH_WILDCARD_REGEX.test(githubBranch)) {
            throw new Error('githubBranch must not contain wildcard characters (*, ?, [).');
        }
        // githubBranchは、GitHubのブランチ名として有効な文字（英数字、ドット、アンダースコア、ハイフン、スラッシュ）を含む必要がある
        if (!config_1.GITHUB_BRANCH_REGEX.test(githubBranch)) {
            throw new Error('githubBranch must be a valid ref segment (e.g. main, release/v1.2.3).');
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZhbGlkYXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFXQSxvRUFVQztBQUVELDhEQVVDO0FBRUQsZ0VBVUM7QUFFRCxrREFFQztBQUVELDhEQXNCQztBQXpFRCxpREFBbUM7QUFDbkMscUNBT2tCO0FBQ2xCLDBDQUEwQztBQUMxQywwREFBMEQ7QUFDMUQsU0FBZ0IsNEJBQTRCLENBQUMsR0FBMEI7SUFDckUsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN0RixNQUFNLGVBQWUsR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDO0lBQ3JDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLHlCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1FBQ3ZGLE1BQU0sSUFBSSxLQUFLLENBQ2IsK0dBQStHLENBQ2hILENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxlQUFlLENBQUM7QUFDekIsQ0FBQztBQUNELHVDQUF1QztBQUN2QyxTQUFnQix5QkFBeUIsQ0FBQyxPQUFnQjtJQUN4RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLGlGQUFpRixDQUFDLENBQUM7SUFDckcsQ0FBQztJQUVELElBQUksQ0FBQyx5QkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNwQyxNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2pCLENBQUM7QUFDRCxpQ0FBaUM7QUFDakMsU0FBZ0IsMEJBQTBCLENBQUMsa0JBQTBCO0lBQ25FLHNDQUFzQztJQUN0Qyx1REFBdUQ7SUFDdkQsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7UUFDL0MsT0FBTztJQUNULENBQUM7SUFFRCxJQUFJLENBQUMsNEJBQW1CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztRQUNsRCxNQUFNLElBQUksS0FBSyxDQUFDLGlGQUFpRixDQUFDLENBQUM7SUFDckcsQ0FBQztBQUNILENBQUM7QUFDRCwwQkFBMEI7QUFDMUIsU0FBZ0IsbUJBQW1CLENBQUMsU0FBaUI7SUFDbkQsT0FBTyxTQUFTLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNoRCxDQUFDO0FBQ0QsK0JBQStCO0FBQy9CLFNBQWdCLHlCQUF5QixDQUFDLFdBQW9CLEVBQUUsVUFBbUIsRUFBRSxZQUFxQjtJQUN4RyxJQUFJLFdBQVcsS0FBSyxTQUFTLElBQUksQ0FBQywyQkFBa0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztRQUN2RSxNQUFNLElBQUksS0FBSyxDQUFDLDhEQUE4RCxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUNILGtFQUFrRTtJQUNoRSxJQUFJLFVBQVUsS0FBSyxTQUFTLElBQUksQ0FBQywwQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUNwRSxNQUFNLElBQUksS0FBSyxDQUFDLGdGQUFnRixDQUFDLENBQUM7SUFDcEcsQ0FBQztJQUNILHVHQUF1RztJQUNyRyxJQUFJLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMvQixJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFDTCx3Q0FBd0M7UUFDcEMsSUFBSSxxQ0FBNEIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUNwRCxNQUFNLElBQUksS0FBSyxDQUFDLDhEQUE4RCxDQUFDLENBQUM7UUFDbEYsQ0FBQztRQUNMLHlFQUF5RTtRQUNyRSxJQUFJLENBQUMsNEJBQW1CLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO1FBQzNGLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQge1xuICBBQ0NPVU5UX0lEX1JFR0VYLFxuICBHSVRIVUJfQlJBTkNIX1JFR0VYLFxuICBHSVRIVUJfQlJBTkNIX1dJTERDQVJEX1JFR0VYLFxuICBHSVRIVUJfT1dORVJfUkVHRVgsXG4gIEdJVEhVQl9SRVBPX1JFR0VYLFxuICBTM19CVUNLRVRfQVJOX1JFR0VYLFxufSBmcm9tICcuL2NvbmZpZyc7XG4vLyBBV1MgQ0RL44Gu44K544K/44OD44Kv44KE44Oq44K944O844K544Gu44OX44Ot44OR44OG44Kj44Gr5a++44GZ44KL44OQ44Oq44OH44O844K344On44Oz6Zai5pWw44KS5a6a576pXG4vLyDjgZPjgozjgonjga7plqLmlbDjga/jgIHjgrnjgr/jg4Pjgq/jga7jgrPjg7Pjgrnjg4jjg6njgq/jgr/lhoXjgoTjgIFDREvjgqLjg5fjg6rjga7jgqjjg7Pjg4jjg6rjg7zjg53jgqTjg7Pjg4jjgaflkbzjgbPlh7rjgZXjgozjgovjgZPjgajjgpLmg7PlrprjgZfjgabjgYTjgotcbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50KGVudj86IHsgYWNjb3VudD86IHN0cmluZyB9KTogc3RyaW5nIHtcbiAgY29uc3QgaGFzRXhwbGljaXRBY2NvdW50ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGVudiA/PyB7fSwgJ2FjY291bnQnKTtcbiAgY29uc3QgZXhwbGljaXRBY2NvdW50ID0gZW52Py5hY2NvdW50O1xuICBpZiAoIWhhc0V4cGxpY2l0QWNjb3VudCB8fCAhZXhwbGljaXRBY2NvdW50IHx8ICFBQ0NPVU5UX0lEX1JFR0VYLnRlc3QoZXhwbGljaXRBY2NvdW50KSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICdlbnYuYWNjb3VudCBtdXN0IGJlIGV4cGxpY2l0bHkgc2V0IHRvIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSUQuIFNldCBDREtfREVGQVVMVF9BQ0NPVU5UIGJlZm9yZSBzeW50aC9kZXBsb3kuJyxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIGV4cGxpY2l0QWNjb3VudDtcbn1cbi8vIENES19ERUZBVUxUX0FDQ09VTlTjgYzoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLmpJzoqLzjgZnjgovplqLmlbBcbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUNka0RlZmF1bHRBY2NvdW50KGFjY291bnQ/OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIWFjY291bnQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NES19ERUZBVUxUX0FDQ09VTlQgaXMgcmVxdWlyZWQuIENvbmZpZ3VyZSBBV1MgY3JlZGVudGlhbHMgYmVmb3JlIHN5bnRoL2RlcGxveS4nKTtcbiAgfVxuXG4gIGlmICghQUNDT1VOVF9JRF9SRUdFWC50ZXN0KGFjY291bnQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdDREtfREVGQVVMVF9BQ0NPVU5UIG11c3QgYmUgYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC4nKTtcbiAgfVxuXG4gIHJldHVybiBhY2NvdW50O1xufVxuLy8gZW52TmFtZeOBjOOCteODneODvOODiOOBleOCjOOBpuOBhOOCi+WApOOBp+OBguOCi+OBk+OBqOOCkuaknOiovOOBmeOCi+mWouaVsFxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2Vjb25kYXJ5QnVja2V0QXJuKHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nKTogdm9pZCB7XG4gIC8vIHN5bnRo5pmC54K544Gn44Gv44CB5Yil44K544K/44OD44Kv55Sx5p2l44Gu5YCk44GM5pyq6Kej5rG644OI44O844Kv44Oz44Gr44Gq44KL5aC05ZCI44GM44GC44KLXG4gIC8vIO+8iOS+izogYXJuOmF3czpzMzo6OiR7VG9rZW5bVE9LRU4uMTIzXX0p44CC44GT44Gu44Kx44O844K544Gv5pyJ5Yq544Go44GX44Gm5omx44GG44CCXG4gIGlmIChjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHNlY29uZGFyeUJ1Y2tldEFybikpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIVMzX0JVQ0tFVF9BUk5fUkVHRVgudGVzdChzZWNvbmRhcnlCdWNrZXRBcm4pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZWNvbmRhcnlCdWNrZXRBcm4gbXVzdCBiZSBhIHZhbGlkIFMzIGJ1Y2tldCBBUk4gKGUuZy4gYXJuOmF3czpzMzo6Om15LWJ1Y2tldCkuJyk7XG4gIH1cbn1cbi8vIFMz44OQ44Kx44OD44OIQVJO44GL44KJ44OQ44Kx44OD44OI5ZCN44KS5oq95Ye644GZ44KL6Zai5pWwXG5leHBvcnQgZnVuY3Rpb24gdG9CdWNrZXROYW1lRnJvbUFybihidWNrZXRBcm46IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBidWNrZXRBcm4ucmVwbGFjZSgnYXJuOmF3czpzMzo6OicsICcnKTtcbn1cbi8vIEdpdEh1YiBPSURD6Zai6YCj44Gu44Kz44Oz44OG44Kt44K544OI5YCk44KS5qSc6Ki844GZ44KL6Zai5pWwXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVHaXRIdWJPaWRjQ29udGV4dChnaXRodWJPd25lcj86IHN0cmluZywgZ2l0aHViUmVwbz86IHN0cmluZywgZ2l0aHViQnJhbmNoPzogc3RyaW5nKTogdm9pZCB7XG4gIGlmIChnaXRodWJPd25lciAhPT0gdW5kZWZpbmVkICYmICFHSVRIVUJfT1dORVJfUkVHRVgudGVzdChnaXRodWJPd25lcikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dpdGh1Yk93bmVyIG11c3QgY29udGFpbiBvbmx5IGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zLicpO1xuICB9XG4vLyBnaXRodWJSZXBv44Gv44CBR2l0SHVi44Gu44Oq44Od44K444OI44Oq5ZCN44Go44GX44Gm5pyJ5Yq544Gq5paH5a2X77yI6Iux5pWw5a2X44CB44OJ44OD44OI44CB44Ki44Oz44OA44O844K544Kz44Ki44CB44OP44Kk44OV44Oz77yJ44KS5ZCr44KA5b+F6KaB44GM44GC44KLXG4gIGlmIChnaXRodWJSZXBvICE9PSB1bmRlZmluZWQgJiYgIUdJVEhVQl9SRVBPX1JFR0VYLnRlc3QoZ2l0aHViUmVwbykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dpdGh1YlJlcG8gbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgZG90cywgdW5kZXJzY29yZXMsIGFuZCBoeXBoZW5zLicpO1xuICB9XG4vLyBnaXRodWJCcmFuY2jjga/jgIFHaXRIdWLjga7jg5bjg6njg7Pjg4HlkI3jgajjgZfjgabmnInlirnjgarmloflrZfvvIjoi7HmlbDlrZfjgIHjg4njg4Pjg4jjgIHjgqLjg7Pjg4Djg7zjgrnjgrPjgqLjgIHjg4/jgqTjg5Xjg7PjgIHjgrnjg6njg4Pjgrfjg6XvvInjgpLlkKvjgoDlv4XopoHjgYzjgYLjgovjgILjgb7jgZ/jgIHjg6/jgqTjg6vjg4njgqvjg7zjg4nmloflrZfvvIgq44CBP+OAgVvvvInjgpLlkKvjgpPjgafjga/jgYTjgZHjgarjgYTjgIJcbiAgaWYgKGdpdGh1YkJyYW5jaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKGdpdGh1YkJyYW5jaC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2l0aHViQnJhbmNoIG11c3Qgbm90IGJlIGVtcHR5LicpO1xuICAgIH1cbi8vIOODr+OCpOODq+ODieOCq+ODvOODieaWh+Wtl+OCkuWQq+OCgOODluODqeODs+ODgeWQjeOBr+OCteODneODvOODiOOBl+OBquOBhOOBn+OCgeOAgeOCqOODqeODvOOCkuOCueODreODvOOBmeOCi1xuICAgIGlmIChHSVRIVUJfQlJBTkNIX1dJTERDQVJEX1JFR0VYLnRlc3QoZ2l0aHViQnJhbmNoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnaXRodWJCcmFuY2ggbXVzdCBub3QgY29udGFpbiB3aWxkY2FyZCBjaGFyYWN0ZXJzICgqLCA/LCBbKS4nKTtcbiAgICB9XG4vLyBnaXRodWJCcmFuY2jjga/jgIFHaXRIdWLjga7jg5bjg6njg7Pjg4HlkI3jgajjgZfjgabmnInlirnjgarmloflrZfvvIjoi7HmlbDlrZfjgIHjg4njg4Pjg4jjgIHjgqLjg7Pjg4Djg7zjgrnjgrPjgqLjgIHjg4/jgqTjg5Xjg7PjgIHjgrnjg6njg4Pjgrfjg6XvvInjgpLlkKvjgoDlv4XopoHjgYzjgYLjgotcbiAgICBpZiAoIUdJVEhVQl9CUkFOQ0hfUkVHRVgudGVzdChnaXRodWJCcmFuY2gpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dpdGh1YkJyYW5jaCBtdXN0IGJlIGEgdmFsaWQgcmVmIHNlZ21lbnQgKGUuZy4gbWFpbiwgcmVsZWFzZS92MS4yLjMpLicpO1xuICAgIH1cbiAgfVxufVxuIl19