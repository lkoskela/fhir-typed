import { ValidationResult } from "@src/api/fhir-validator.js";
import { pluralize } from "@src/utils/strings.js";
import { MatcherState } from "@vitest/expect";
import { ExpectationResult } from "@vitest/expect";
import { SafeParseReturnType } from "zod";

interface Options {
    /** Here we could specify some parameters? */
    includeShadowDom?: boolean;
}

const simplifyResult = (
    result: ValidationResult | SafeParseReturnType<any, any>
): { success: boolean; issues: string[] } => {
    // If the result is successful, it doesn't matter what the exact type is:
    if (result.success) {
        return { success: true, issues: [] };
    }

    // If the result is a ValidationResult, it should have an `errors` property that is an array of strings
    if (Array.isArray((result as ValidationResult).errors)) {
        return { success: false, issues: (result as ValidationResult).errors || [] };
    }

    // Otherwise, the result should be a `SafeParseReturnType<any, any>` and we can use the `error.issues` property
    const issues = ((result as SafeParseReturnType<any, any>).error?.issues || []).map(
        (item) => `[${item.code}] ${item.path.join(".")}: ${item.message}`
    );
    return { success: false, issues: issues };
};

const stringifyIssues = (issues: string[], list: boolean = false, truncate: number = 10000): string => {
    if (list) {
        return issues
            .map((issue) => `- ${issue}`)
            .join("\n")
            .substring(0, truncate);
    } else {
        return issues.join(", ").substring(0, truncate);
    }
};

/**
 * Expect the `SafeParseReturnType<any, any>` to represent a passing validation,
 * i.e. no issues reported.
 */
export function toPass<T extends MatcherState = MatcherState>(this: T, received: any): ExpectationResult {
    const result = simplifyResult(received as SafeParseReturnType<any, any>);
    if (result.success !== true) {
        if (result.issues.length === 0) {
            console.error(
                `WTF? Zod validation returned success:false but zero issues? ${JSON.stringify(received, null, 4)}`
            );
        }
        return {
            pass: false,
            message: () =>
                `Expected input to pass validation, but it failed with ${pluralize(
                    result.issues,
                    "issue"
                )}:\n${stringifyIssues(result.issues, true)}`,
        };
    } else if (result.issues.length > 0) {
        return {
            pass: false,
            message: () =>
                `Expected input to pass validation, which it did, but there were ${pluralize(
                    result.issues,
                    "issue"
                )} reported nevertheless:\n${stringifyIssues(result.issues, true)}`,
        };
    }
    return {
        pass: true,
        message: () => `Expected ${JSON.stringify(received.data)} to pass, which it did.`,
    };
}

/**
 * Expect the `SafeParseReturnType<any, any>` to represent a failed validation,
 * i.e. at least one issue reported.
 *
 * Optionally, you can specify a list of issues that should be reported.
 *
 * @param issues A list of issues that should be reported.
 */
export function toFail<T extends MatcherState = MatcherState>(
    this: T,
    received: any,
    issues: Array<string | RegExp> = [],
    exact: boolean = false
): ExpectationResult {
    const result = simplifyResult(received as SafeParseReturnType<any, any>);
    if (result.success !== false) {
        return {
            pass: false,
            message: () => `Expected input to fail, but it did not: ${JSON.stringify(received.data, null, 4)}`,
        };
    }
    if (issues.length > 0) {
        if (exact) {
            // Check that the listed issues are present and are the only issues present in the result
        } else {
            // Check that all the listed issues are present in the result
            const issueMatches = issues.map(
                (pattern: string | RegExp) =>
                    !!result.issues.find((issue: string) => {
                        if (pattern instanceof RegExp) {
                            return !!issue.match(pattern);
                        } else {
                            return issue.includes(pattern);
                        }
                    })
            );
            const notFound = issueMatches.filter((result: boolean) => result !== true).length;
            return {
                pass: notFound === 0,
                message: () =>
                    `Validation failed as expected, but ${notFound} out of ${issueMatches.length} expected issues weren't included.`,
                actual: `${stringifyIssues(result.issues)}`,
                expected: `${stringifyIssues(issues.map((issue: string | RegExp) => issue.toString()))}`,
            };
        }
    }
    return {
        pass: true,
        message: () =>
            `Expected ${JSON.stringify(received.data)} to fail, which it did with ${
                result.issues.length
            } issues: ${stringifyIssues(result.issues)}`,
    };
}
