import { z } from "zod";
import { prettyPrintSchema } from "@src/schemas/utils/print.js";


describe("prettyPrintSchema", () => {
    describe("with a simple schema", () => {
        const schema = z.object({
            age: z.number().min(1).max(100),
            names: z.array(z.string().regex(/^https?:\/\/.+/)).optional(),
            kind: z.literal("fixedvaluehere"),
            draft: z.boolean(),
            required: z.boolean(),
        });

        it("should serialize a Zod schema into a JavaScript object", () => {
            const output = prettyPrintSchema(schema, {})
            expect(output).toStrictEqual({
                __type: "ZodObject",
                age: {
                    __type: "ZodNumber",
                    min: 1,
                    max: 100,
                    finite: undefined,
                    multipleOf: undefined,
                    int: undefined,
                },
                kind: {
                    __type: "ZodLiteral",
                    value: "fixedvaluehere",
                },
                draft: {
                    __type: "ZodBoolean",
                },
                required: {
                    __type: "ZodBoolean",
                },
                names: {
                    __optional: true,
                    __type: "ZodArray",
                    exactLength: undefined,
                    minLength: undefined,
                    maxLength: undefined,
                    itemType: {
                        __type: "ZodString",
                        regex: "/^https?:\\/\\/.+/",
                        min: undefined,
                        max: undefined,
                        base64: undefined,
                        base64url: undefined,
                        email: undefined,
                        ulid: undefined,
                        uuid: undefined,
                        cuid: undefined,
                        cuid2: undefined,
                        nanoid: undefined,
                        url: undefined,
                        ip: undefined,
                        jwt: undefined,
                        cidr: undefined,
                        date: undefined,
                        duration: undefined,
                        emoji: undefined,
                        includes: undefined,
                        startsWith: undefined,
                        endsWith: undefined,
                        trim: undefined,
                        toUpperCase: undefined,
                        toLowerCase: undefined,
                    }
                },
            });
        });
    });
});
