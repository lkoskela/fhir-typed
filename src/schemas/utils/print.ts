import {
    ZodTypeAny,
    ZodObject,
    ZodArray,
    ZodOptional,
    ZodString,
    ZodNumber,
    ZodBoolean,
    ZodLiteral,
    ZodEffects,
    ZodBigInt,
    ZodDate,
    ZodEnum,
    ZodNativeEnum,
    ZodNullable,
    ZodNaN,
    ZodReadonly,
    ZodBranded,
    ZodPipeline,
    ZodIntersection,
    ZodUnknown,
    ZodUnion,
} from "zod";

import { removeDuplicates } from "@src/utils/utils.js";

export type PrettyPrintSchemaOptions = {
    mergeIntersections?: boolean;
    omitEffects?: boolean;
    flattenReadonly?: boolean;
    flattenNullable?: boolean;
    flattenOptional?: boolean;
    flattenUnions?: boolean;
};

const defaultOptions = {
    mergeIntersections: false,
    omitEffects: true,
    flattenReadonly: true,
    flattenNullable: true,
    flattenOptional: true,
    flattenUnions: true,
} satisfies Partial<PrettyPrintSchemaOptions>;

const flattenSerializedSchema = (schema: any, options: PrettyPrintSchemaOptions): any => {
    if (options.flattenNullable) {
        // TODO
    }
    if (options.flattenReadonly) {
        // TODO
    }
    if (options.mergeIntersections) {
        // TODO
    }
    if (options.omitEffects) {
        // TODO
    }
    return schema;
};

const serializeSchema = (schema: ZodTypeAny, options: PrettyPrintSchemaOptions): any => {
    if (schema instanceof ZodObject) {
        const shape = schema._def.shape();
        const result: Record<string, any> = {};
        for (const key in shape) {
            result[key] = serializeSchema(shape[key], options);
        }
        return { __type: "ZodObject", ...result };
    }

    if (schema instanceof ZodIntersection) {
        const left = serializeSchema(schema._def.left, options);
        const right = serializeSchema(schema._def.right, options);
        if (removeDuplicates([left, right]).length === 1) {
            return left;
        } else if (JSON.stringify(left).includes("/^[A-Za-z0-9\\-\\.]{1,64}$/")) {
            console.warn(
                `Not flattening intersection because left and right are not identical?:\n${JSON.stringify(
                    left
                )}\n${JSON.stringify(right)}`
            );
        }
        return {
            __type: "ZodIntersection",
            left: serializeSchema(schema._def.left, options),
            right: serializeSchema(schema._def.right, options),
        };
    }

    if (schema instanceof ZodArray) {
        return {
            __type: "ZodArray",
            exactLength: schema._def.exactLength?.value || undefined,
            maxLength: schema._def.maxLength?.value || undefined,
            minLength: schema._def.minLength?.value || undefined,
            //innerType: serializeSchema(schema._def.type._def.innerType, options),
            itemType: serializeSchema(schema._def.type, options),
        };
    }

    if (schema instanceof ZodUnion) {
        const unionOptions = schema._def.options.map((o: any) => serializeSchema(o, options));
        if (options.flattenUnions) {
            const uniqueOptions = removeDuplicates(unionOptions);
            if (uniqueOptions.length === 1) {
                return uniqueOptions[0];
            }
            return { __type: "ZodUnion", options: uniqueOptions };
        }
        return {
            __type: "ZodUnion",
            options: unionOptions,
        };
    }

    if (schema instanceof ZodOptional) {
        if (options.flattenOptional) {
            return {
                __optional: true,
                ...serializeSchema(schema._def.innerType, options),
            };
        } else {
            return {
                __type: "ZodOptional",
                innerType: serializeSchema(schema._def.innerType, options),
            };
        }
    }

    if (schema instanceof ZodString) {
        return {
            __type: "ZodString",
            trim: !!schema._def.checks.find((c) => c.kind === "trim") || undefined,
            toLowerCase: !!schema._def.checks.find((c) => c.kind === "toLowerCase") || undefined,
            toUpperCase: !!schema._def.checks.find((c) => c.kind === "toUpperCase") || undefined,
            date: !!schema._def.checks.find((c) => c.kind === "date") || undefined,
            duration: !!schema._def.checks.find((c) => c.kind === "duration") || undefined,
            base64: !!schema._def.checks.find((c) => c.kind === "base64") || undefined,
            base64url: !!schema._def.checks.find((c) => c.kind === "base64url") || undefined,
            email: !!schema._def.checks.find((c) => c.kind === "email") || undefined,
            url: !!schema._def.checks.find((c) => c.kind === "url") || undefined,
            emoji: !!schema._def.checks.find((c) => c.kind === "emoji") || undefined,
            cuid: !!schema._def.checks.find((c) => c.kind === "cuid") || undefined,
            cuid2: !!schema._def.checks.find((c) => c.kind === "cuid2") || undefined,
            uuid: !!schema._def.checks.find((c) => c.kind === "uuid") || undefined,
            ulid: !!schema._def.checks.find((c) => c.kind === "ulid") || undefined,
            nanoid: !!schema._def.checks.find((c) => c.kind === "nanoid") || undefined,
            regex: schema._def.checks.find((c) => c.kind === "regex")?.regex?.toString() || undefined,
            min: schema._def.checks.find((c) => c.kind === "min")?.value || undefined,
            max: schema._def.checks.find((c) => c.kind === "max")?.value || undefined,
            cidr: schema._def.checks.find((c) => c.kind === "cidr")?.version || undefined,
            ip: schema._def.checks.find((c) => c.kind === "ip")?.version || undefined,
            jwt: schema._def.checks.find((c) => c.kind === "jwt")?.alg || undefined,
            endsWith: schema._def.checks.find((c) => c.kind === "endsWith")?.value || undefined,
            startsWith: schema._def.checks.find((c) => c.kind === "startsWith")?.value || undefined,
            includes:
                [schema._def.checks.find((c) => c.kind === "includes")]
                    .filter((c) => !!c)
                    .map((c) => ({
                        value: c.value,
                        position: c.position || undefined,
                    }))?.[0] || undefined,
        };
    }

    if (schema instanceof ZodNumber) {
        return {
            __type: "ZodNumber",
            multipleOf: schema._def.checks.find((c) => c.kind === "multipleOf")?.value || undefined,
            int: !!schema._def.checks.find((c) => c.kind === "int") || undefined,
            finite: !!schema._def.checks.find((c) => c.kind === "finite") || undefined,
            min: schema._def.checks.find((c) => c.kind === "min")?.value || undefined,
            max: schema._def.checks.find((c) => c.kind === "max")?.value || undefined,
        };
    }

    if (schema instanceof ZodBigInt) {
        return {
            __type: "ZodBigInt",
            multipleOf: schema._def.checks.find((c) => c.kind === "multipleOf")?.value || undefined,
            min: schema._def.checks.find((c) => c.kind === "min")?.value || undefined,
            max: schema._def.checks.find((c) => c.kind === "max")?.value || undefined,
        };
    }

    if (schema instanceof ZodDate) {
        return {
            __type: "ZodDate",
            min: schema._def.checks.find((c) => c.kind === "min")?.value || undefined,
            max: schema._def.checks.find((c) => c.kind === "max")?.value || undefined,
        };
    }

    if (schema instanceof ZodBoolean) {
        return { __type: "ZodBoolean" };
    }

    if (schema instanceof ZodLiteral) {
        return { __type: "ZodLiteral", value: schema._def.value };
    }

    if (schema instanceof ZodEnum) {
        return { __type: "ZodEnum", value: schema._def.values };
    }

    if (schema instanceof ZodNativeEnum) {
        return {
            __type: "ZodNativeEnum",
            value: schema._def.values.map((v: any) => serializeSchema(v, options)),
        };
    }

    if (schema instanceof ZodNullable) {
        if (options.flattenNullable) {
            return {
                __nullable: true,
                ...serializeSchema(schema._def.innerType, options),
            };
        } else {
            return {
                __type: "ZodNullable",
                value: serializeSchema(schema._def.innerType, options),
            };
        }
    }

    if (schema instanceof ZodReadonly) {
        if (options.flattenReadonly) {
            return {
                __readonly: true,
                ...serializeSchema(schema._def.innerType, options),
            };
        } else {
            return {
                __type: "ZodReadonly",
                value: serializeSchema(schema._def.innerType, options),
            };
        }
    }

    if (schema instanceof ZodBranded) {
        return {
            __type: "ZodBranded",
            value: serializeSchema(schema._def.type, options),
        };
    }

    if (schema instanceof ZodPipeline) {
        return {
            __type: "ZodPipeline",
            in: serializeSchema(schema._def.in, options),
            out: serializeSchema(schema._def.out, options),
        };
    }

    if (schema instanceof ZodNaN) {
        return { __type: "ZodNaN" };
    }

    if (schema instanceof ZodUnknown) {
        return { __type: "ZodUnknown" };
    }

    if (schema instanceof ZodEffects) {
        if (options.omitEffects) {
            return serializeSchema(schema._def.schema, options);
        } else {
            return {
                __type: "ZodEffects",
                innerType: serializeSchema(schema._def.schema, options),
            };
        }
    }

    return schema;
};

/**
 * "Pretty-prints" the given Zod schema's structure into a JavaScript object.
 *
 * @param schema The Zod schema to pretty-print
 * @returns A JavaScript object representing the schema's structure.
 */
export const prettyPrintSchema = (schema: ZodTypeAny, options?: PrettyPrintSchemaOptions): any => {
    const effectiveOptions = { ...defaultOptions, ...options };
    const serialized = serializeSchema(schema, effectiveOptions);
    return flattenSerializedSchema(serialized, effectiveOptions);
};
