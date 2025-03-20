import { z } from "zod";

type RefinementFunction = (data: any, ctx: z.RefinementCtx) => void;

export function MustHaveAtMostOneFieldStartingWith(prefix: string): RefinementFunction {
    return (data: any, ctx: z.RefinementCtx) => {
        const fields = Object.keys(data).filter((key) => key.startsWith(prefix));
        if (fields.length > 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `${fields.length} instances of choice-of-type field ${prefix}[x] found: ${fields.join(", ")}`,
            });
        }
    };
}

export function ObjectMustNotBeEmpty(data: any, ctx: z.RefinementCtx): void {
    const lastPathSegment = ctx.path.slice(-1)[0];
    if (typeof lastPathSegment === "number" || lastPathSegment?.match(/^\d+$/)) {
        // This is an array index, so we don't need to check for emptiness!
        return;
    }
    const objectType = Array.isArray(data) ? "array" : typeof data;
    if (objectType === "object" && Object.keys(data).length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `An ${objectType} must have some content: ${JSON.stringify(data)}`,
        });
    }
}
