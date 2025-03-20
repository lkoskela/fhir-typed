import 'vitest';

interface CustomSafeParseReturnTypeMatchers<R = unknown> {
    toPass(): R;
    toFail(issues?: Array<string | RegExp>, exact?: boolean): R;
}

declare module "vitest" {
    interface Assertion<T = any> extends CustomSafeParseReturnTypeMatchers<T> {
        toPass(): T;
        toFail(issues?: Array<string | RegExp>, exact?: boolean): T;
    }
    interface AsymmetricMatchersContaining extends CustomSafeParseReturnTypeMatchers {
        toPass(): void;
        toFail(issues?: Array<string | RegExp>, exact?: boolean): void;
    }
}
