import { z, ZodTypeAny, ZodObject, ZodArray, ZodString, ZodNumber, ZodBoolean, ZodLiteral, ZodOptional } from "zod";

/**
 * Checks whether the given object is a ZodArray.
 *
 * @param obj Object to check.
 * @returns true if the object is a ZodArray.
 */
export const isZodArray = (obj: any): obj is ZodArray<any> => obj instanceof z.ZodArray;

/**
 * Checks whether the given object is a ZodObject or ZodOptional<ZodObject>.
 *
 * @param obj Object to check.
 * @returns true if the object is a ZodObject or ZodOptional<ZodObject>
 */
export const isZodObject = (obj: any): obj is ZodObject<any> => isRequiredZodObject(obj) || isOptionalZodObject(obj);

/**
 * Checks whether the given object is a (non-optional) ZodObject.
 *
 * @param obj Object to check.
 * @returns true if the object is of type ZodObject.
 */
export const isRequiredZodObject = (obj: any): obj is ZodObject<any> => obj instanceof z.ZodObject;

/**
 * Checks whether the given object is an optional ZodObject.
 *
 * @param obj Object to check.
 * @returns true if the object is of type ZodOptional and its inner type is ZodObject.
 */
export const isOptionalZodObject = (obj: any): obj is ZodObject<any> =>
    obj instanceof z.ZodOptional && obj._def.innerType instanceof z.ZodObject;

/**
 * Extracts a human-readable type name from a Zod schema.
 * For example, an optional array of strings would be "optional array of string".
 *
 * @param schema The Zod schema to extract the type name for.
 * @returns string describing the type.
 */
export const getTypeNameFromSchema = (schema: z.Schema): string => {
    const innerTypeOf = (schema: any): string | undefined => {
        return schema?._def?.innerType?._def?.typeName;
    };
    const outerTypeOf = (schema: any): string => {
        return schema?._def?.typeName || "(unknown)";
    };
    const inner = innerTypeOf(schema);
    const outer = outerTypeOf(schema);
    if (inner) {
        const outerName = outer === "ZodOptional" ? "optional" : outer === "ZodArray" ? "array of" : outer;
        return `${outerName} ${getTypeNameFromSchema((schema as any)._def.innerType)}`;
    } else {
        return outer;
    }
};

const mergeOptionalSchemas = <T extends ZodTypeAny>(
    schema1: ZodOptional<T>,
    schema2: ZodOptional<T>,
    keyPath?: string
): ZodOptional<T> => {
    const innerType1 = schema1._def.innerType;
    const innerType2 = schema2._def.innerType;
    // Ensure both schemas have the same base type before merging
    if (innerType1.constructor?.name !== innerType2.constructor?.name) {
        if (innerType1 instanceof z.ZodObject && innerType2 instanceof z.ZodArray) {
            console.debug(`Merging optional object with an optional array at ${keyPath} - returning the array`);
            return schema2;
        }
        throw new Error(
            `Cannot merge optional schemas with different base types (${innerType1.constructor?.name} !== ${
                innerType2.constructor?.name
            })${keyPath ? ` at ${keyPath}` : ""}`
        );
    }
    // Merge the inner schemas based on their type
    const mergedInnerSchema = innerType1.and(innerType2) as T;
    return mergedInnerSchema.optional(); // Ensure the final schema remains optional
};

function mergeArraySchemas<T extends ZodTypeAny>(
    schema1: ZodArray<T>,
    schema2: ZodArray<T>
): ZodArray<T> | ZodOptional<ZodArray<T>> {
    // Ensure both arrays have the same item type
    if (schema1._def.type.constructor !== schema2._def.type.constructor) {
        throw new Error("Cannot merge ZodArray schemas with different element types");
    }

    // Extract inner types
    const itemType = schema1._def.type as T;

    // Extract min and max constraints, preserving strictest limits
    const min1 = schema1._def.minLength?.value ?? 0;
    const max1 = schema1._def.maxLength?.value ?? Infinity;
    const min2 = schema2._def.minLength?.value ?? 0;
    const max2 = schema2._def.maxLength?.value ?? Infinity;

    const mergedMin = Math.max(min1, min2); // Use the larger min value
    const mergedMax = Math.min(max1, max2); // Use the smaller max value

    let mergedArray = z.array(itemType).min(mergedMin).max(mergedMax);

    // Preserve optionality
    if (schema1 instanceof ZodOptional || schema2 instanceof ZodOptional) {
        return mergedArray.optional();
    }

    return mergedArray;
}

const mergeNumberSchemas = (existing: ZodNumber, incoming: ZodNumber): ZodNumber => {
    return existing
        .min(incoming._def.checks.find((c) => c.kind === "min")?.value ?? -Infinity)
        .max(incoming._def.checks.find((c) => c.kind === "max")?.value ?? Infinity);
};

const mergeBooleanSchemas = (_existing: ZodBoolean, incoming: ZodBoolean): ZodBoolean => {
    return incoming;
};

const mergeStringSchemas = (existing: ZodString, incoming: ZodString): ZodString => {
    return existing
        .min(incoming._def.checks.find((c) => c.kind === "min")?.value ?? 0)
        .max(incoming._def.checks.find((c) => c.kind === "max")?.value ?? Infinity);
};

const mergeObjectSchemas = (existing: ZodObject<any>, incoming: ZodObject<any>) => {
    return existing.merge(incoming);
};

const mergeLiteralSchemas = (existing: ZodLiteral<any>, incoming: ZodLiteral<any>): ZodLiteral<any> => {
    if (typeof existing.value !== typeof incoming.value) {
        throw new Error(`Conflicting literal types: ${typeof existing.value} !== ${typeof incoming.value}`);
    }
    if (existing.value !== incoming.value) {
        throw new Error(`Conflicting literals: ${existing.value} !== ${incoming.value}`);
    }
    return existing;
};

/**
 * Deeply merges two Zod schemas while preserving constraints.
 */
export const mergeSchemas = (
    existing: ZodTypeAny,
    incoming: ZodTypeAny,
    keyPath?: string,
    originalExisting: ZodTypeAny = existing,
    originalIncoming: ZodTypeAny = incoming
): ZodTypeAny => {
    if (existing instanceof z.ZodObject && incoming instanceof z.ZodObject) {
        return mergeObjectSchemas(existing, incoming);
    }
    if (existing instanceof ZodArray && incoming instanceof ZodArray) {
        return mergeArraySchemas(existing, incoming);
        // return existing.element instanceof incoming.element.constructor
        //   ? existing
        //       .min(existing._def.minLength?.value ?? 0)
        //       .max(existing._def.maxLength?.value ?? Infinity)
        //   : incoming;
    }
    if (existing instanceof ZodString && incoming instanceof ZodString) {
        return mergeStringSchemas(existing, incoming);
    }
    if (existing instanceof ZodNumber && incoming instanceof ZodNumber) {
        return mergeNumberSchemas(existing, incoming);
    }
    if (existing instanceof ZodBoolean && incoming instanceof ZodBoolean) {
        return mergeBooleanSchemas(existing, incoming);
    }
    if (existing instanceof ZodLiteral && incoming instanceof ZodLiteral) {
        return mergeLiteralSchemas(existing, incoming);
    }
    if (existing instanceof ZodArray && incoming instanceof ZodArray) {
        return mergeArraySchemas(existing, incoming);
    }
    if (existing instanceof ZodOptional && incoming instanceof ZodOptional) {
        return mergeOptionalSchemas(existing, incoming, keyPath);
    } else if (existing instanceof ZodOptional !== incoming instanceof ZodOptional) {
        // If one schema is optional and the other is not, unwrap the optional schema and merge them as required
        if (existing instanceof ZodOptional) {
            return mergeSchemas(existing.unwrap(), incoming, keyPath, existing, incoming);
        } else if (incoming instanceof ZodOptional) {
            return mergeSchemas(existing, incoming.unwrap(), keyPath, existing, incoming);
        }
    }

    // As a final resort, preserve the stricter schema.
    // Let's see if one of the two schemas was unwrapped, and if so, was one of them optional?
    if (originalExisting instanceof ZodOptional && !(originalIncoming instanceof ZodOptional)) {
        return originalIncoming;
    } else if (!(originalExisting instanceof ZodOptional) && originalIncoming instanceof ZodOptional) {
        return originalExisting;
    }
    return incoming; // assume the "incoming" schema is stricter
};

/**
 * Sorting function that puts top-level keys first, then longer keys, then alphabetical order.
 *
 * @param a First key to compare.
 * @param b Second key to compare.
 * @returns -1 if {a} should come before {b}, 1 if {a} should come after {b}, 0 if {a} and {b} are equal.
 */
export const longestKeyFirst = (a: string, b: string) => {
    const aDepth = a.split(".").length;
    const bDepth = b.split(".").length;
    if (aDepth !== bDepth) {
        // top-level keys come first
        if (aDepth === 1) return -1;
        if (bDepth === 1) return 1;
        // longest key first
        return bDepth - aDepth;
    }
    // default to alphabetical order
    return a.localeCompare(b);
};
