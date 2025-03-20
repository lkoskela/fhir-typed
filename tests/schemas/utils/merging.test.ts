import { mergeSchemas } from "@src/schemas/utils/zod-structures.js";
import { z } from "zod";


describe("merge literal schemas", () => {

    it("should merge two literal schemas with the same value", () => {
        const schema1 = z.literal("test");
        const schema2 = z.literal("test");
        const merged = mergeSchemas(schema1, schema2);
        expect(merged).toEqual(schema1);
    });

    it("should not merge two literals with differing values", () => {
        const schema1 = z.literal("one");
        const schema2 = z.literal("two");
        expect(() => mergeSchemas(schema1, schema2)).toThrow();
    });

    it("should not merge two literals with differing types", () => {
        const schema1 = z.literal(1);
        const schema2 = z.literal("two");
        expect(() => mergeSchemas(schema1, schema2)).toThrow();
    });
});

describe("merge optional schemas", () => {

    it("should merge two optional literals into one if they have the same value", () => {
        const literalString1 = z.optional(z.literal("abc"));
        const literalString2 = z.optional(z.literal("abc"));
        const merged = mergeSchemas(literalString1, literalString2);
        expect(merged.safeParse("abc").success).toBe(true);
        expect(merged.safeParse("abcdef").success).toBe(false);
        expect(merged.safeParse(undefined).success).toBe(true);  // can be optional!
    });

    describe("merging an optional and required schema", () => {
        const optionalLiteral = z.optional(z.literal("abc"));
        const requiredLiteral = z.literal("abc");

        it("merging an optional literal with a required literal yields the required literal", () => {
            const merged = mergeSchemas(optionalLiteral, requiredLiteral);
            expect(merged.safeParse("abc").success).toBe(true);
            expect(merged.safeParse("abcdef").success).toBe(false);
            expect(merged.safeParse(undefined).success).toBe(false); // can't be optional!
        });

        it("merging a required literal with an optional literal yields the required literal", () => {
            const merged = mergeSchemas(requiredLiteral, optionalLiteral);
            expect(merged.safeParse("abc").success).toBe(true);
            expect(merged.safeParse("abcdef").success).toBe(false);
            expect(merged.safeParse(undefined).success).toBe(false); // can't be optional!
        });

    });

    it("merging two optional schemas with incompatible types yields an error", () => {
        expect(() => mergeSchemas(z.optional(z.string()), z.optional(z.number()))).toThrow();
    });

    it("merging a required schema with an optional schema with an incompatible type yields the required schema", () => {
        const schema = mergeSchemas(z.string(), z.optional(z.number()));
        expect(schema.safeParse("abc").success).toBe(true);
        expect(schema.safeParse(123).success).toBe(false);
        expect(schema.safeParse(undefined).success).toBe(false);
    });

    it("merging an optional schema with a required schema with an incompatible type yields the required schema", () => {
        const schema = mergeSchemas(z.optional(z.string()), z.number());
        expect(schema.safeParse("abc").success).toBe(false);
        expect(schema.safeParse(123).success).toBe(true);
        expect(schema.safeParse(undefined).success).toBe(false);
    });
});