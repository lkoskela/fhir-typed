import { z } from "zod";

import { CodeSystem, ValueSet, ValueSetComposeInclude } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "../../types/index.js";
import console from "@src/utils/console.js";
import {
    findConcept,
    hierarchicalAncestorsOf,
    hierarchicalDescendantsOf,
    isConceptHierarchy,
} from "@src/schemas/codesystems/hierarchy.js";

type ResolveSchemaFn = (nameOrUrl: string) => undefined | z.Schema;

type ResolveResourceFn = (nameOrUrl: string) => undefined | any;

/**
 * Represents a filter definition that a `ValueSet` can specify for an included `CodeSystem`.
 *
 * @see https://www.hl7.org/fhir/valueset-definitions.html#ValueSet.compose.include.filter
 */
type SystemIncludeFilter = {
    property: string;
    op: "=" | "is-a" | "descendent-of" | "is-not-a" | "regex" | "in" | "not-in" | "generalizes" | "exists";
    value: string;
};

/**
 * Represents an include definition that a `ValueSet` can specify for including concepts from a `CodeSystem`.
 *
 * @see https://www.hl7.org/fhir/valueset-definitions.html#ValueSet.compose.include
 */
type SystemInclude = {
    system: string;
    concept?: { code: string }[];
    filter?: SystemIncludeFilter[];
};

/**
 * Represents an include definition that a `ValueSet` can specify for including concepts from another `ValueSet`.
 *
 * @see https://www.hl7.org/fhir/valueset-definitions.html#ValueSet.compose.include
 */
type ValueSetInclude = {
    valueSet: string[];
};

/**
 * Checks if a given `ValueSetComposeInclude` is a `SystemInclude`.
 *
 * @param include The include to check.
 * @returns `true` if the include is a `SystemInclude`, `false` otherwise.
 */
function isSystemInclude(include: ValueSetComposeInclude): include is SystemInclude {
    return include.system !== undefined;
}

/**
 * Checks if a given `ValueSetComposeInclude` is a `ValueSetInclude`.
 *
 * @param include The include to check.
 * @returns `true` if the include is a `ValueSetInclude`, `false` otherwise.
 */
function isValueSetInclude(include: ValueSetComposeInclude): include is ValueSetInclude {
    return Array.isArray(include.valueSet) && include.valueSet.length > 0;
}

function isCodeSystem(x: any | undefined): x is CodeSystem {
    return x?.resourceType === "CodeSystem" && x?.url !== undefined && typeof x?.content === "string";
}

/**
 * Creates a schema for a given `ValueSetInclude`.
 *
 * @param include The include to create a schema for.
 * @param resolveSchema A function for resolving a previously registered Zod schema by its name or URL.
 * @param defaultSchema The default schema to use if no other schema is found.
 * @returns An array of schemas for the given include.
 */
function createIncludeSchemasForValueSet(
    include: ValueSetInclude,
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn,
    defaultSchema: z.Schema
): z.Schema[] {
    return include.valueSet.map((url) => resolveSchema(url)).map((schema) => schema || defaultSchema);
}

/**
 * Creates a schema for a given `SystemIncludeFilter`. The object being validated with this schema will have
 * an optional field named `property`, which is an array of objects that each contain a `code` and `value[x]` field.
 *
 * If a filter refers to the special `code` property, it applies to the concept's `code`. Every other property name
 * refers to a `code` field specified within the concept's `property` array.
 *
 * @param filter The filter to create a schema for.
 * @returns A schema for the given filter.
 */
export function createFilterSchema(
    codeSystemUrl: string,
    filter: SystemIncludeFilter,
    resolveResource: ResolveResourceFn
): z.Schema {
    const description = `${filter.property} ${filter.op} ${JSON.stringify(filter.value)}`;
    const valueSchema = ((): z.Schema => {
        if (filter.op === "=") {
            return z.literal(filter.value).describe(description);
        } else if (filter.op === "generalizes") {
            const hierarchy = resolveResource(codeSystemUrl);
            if (isConceptHierarchy(hierarchy)) {
                const allowed = [filter.value, ...hierarchicalAncestorsOf(hierarchy, filter.value)];
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        if (!allowed.includes(value)) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            } else {
                // Without access to the full hierarchy of the CodeSystem, we can't validate the "is-a" filter
                // beyond knowing that if the value equals `filter.value` then it is a valid "is-a" match.
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        // TODO: This is a hack to make the "is-a" filter work for the "child" code.
                        // We should remove this once we have a proper solution that actually checks
                        // the hierarchy of the codes from the source (the CodeSystem resource).
                        if (value !== filter.value) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            }
        } else if (filter.op === "is-a") {
            const hierarchy = resolveResource(codeSystemUrl);
            if (isConceptHierarchy(hierarchy)) {
                const allowed = [filter.value, ...hierarchicalDescendantsOf(hierarchy, filter.value)];
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        if (!allowed.includes(value)) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            } else {
                // Without access to the full hierarchy of the CodeSystem, we can't validate the "is-a" filter
                // beyond knowing that if the value equals `filter.value` then it is a valid "is-a" match.
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        // TODO: This is a hack to make the "is-a" filter work for the "child" code.
                        // We should remove this once we have a proper solution that actually checks
                        // the hierarchy of the codes from the source (the CodeSystem resource).
                        if (value !== filter.value) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            }
        } else if (filter.op === "is-not-a") {
            const hierarchy = resolveResource(codeSystemUrl);
            if (isConceptHierarchy(hierarchy)) {
                const allowed = [filter.value, ...hierarchicalDescendantsOf(hierarchy, filter.value)];
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        if (allowed.includes(value)) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            } else {
                // Without access to the full hierarchy of the CodeSystem, we can't validate the "is-a" filter
                // beyond knowing that if the value equals `filter.value` then it is a valid "is-a" match.
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        // TODO: This is a hack to make the "is-a" filter work for the "child" code.
                        // We should remove this once we have a proper solution that actually checks
                        // the hierarchy of the codes from the source (the CodeSystem resource).
                        if (value === filter.value) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            }
        } else if (filter.op === "descendent-of") {
            const hierarchy = resolveResource(codeSystemUrl);
            if (isConceptHierarchy(hierarchy)) {
                const allowed = hierarchicalDescendantsOf(hierarchy, filter.value);
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        if (!allowed.includes(value)) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            } else {
                // A proper implementation of the "descendent-of" filter would require interrogating
                // the actual hierarchy of the codes from the CodeSystem resource. Since we don't have
                // it, we'll just check if the value is the same as the filter value – that's the only
                // case when we *know* that the value is NOT a descendent of the filter value...
                return z
                    .string()
                    .describe(description)
                    .superRefine(async (value, ctx) => {
                        if (value === filter.value) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                            });
                        }
                    });
            }
        } else if (filter.op === "regex") {
            return z.string().regex(new RegExp(filter.value), { message: description });
        } else if (filter.op === "in") {
            const allowed = filter.value.split(",").map((s) => s.trim());
            return z.string().superRefine(async (value, ctx) => {
                if (!allowed.includes(value)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                    });
                }
            });
        } else if (filter.op === "not-in") {
            const disallowed = filter.value.split(",").map((s) => s.trim());
            return z.string().superRefine(async (value, ctx) => {
                if (disallowed.includes(value)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Value ${JSON.stringify(value)} does not pass the filter: ${description}`,
                    });
                }
            });
        } else {
            throw new Error(`Unsupported filter operator: ${description} (should not end up in this execution path!)`);
        }
    })();

    if (filter.property === "code") {
        return valueSchema;
    } else {
        const hierarchy = resolveResource(codeSystemUrl);
        if (isConceptHierarchy(hierarchy)) {
            return z.string().superRefine(async (value, ctx) => {
                const concept = findConcept(hierarchy, value);
                if (!concept) {
                    return ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Value ${JSON.stringify(
                            value
                        )} not found from hierarchy (filter: ${description}): ${JSON.stringify(hierarchy, null, 2)}`,
                    });
                }
                const property = concept.properties[filter.property];
                if (!property) {
                    return ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Value ${JSON.stringify(value)} does not have property ${JSON.stringify(
                            filter.property
                        )} (filter: ${description}) : ${JSON.stringify(concept, null, 2)}`,
                    });
                }

                if (property.value !== filter.value) {
                    return ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Value ${JSON.stringify(value)} does not have property ${JSON.stringify(
                            filter.property
                        )} with value ${JSON.stringify(filter.value)} (it's ${JSON.stringify(
                            property.value
                        )} instead) (filter: ${description}) : ${JSON.stringify(concept, null, 2)}`,
                    });
                }
            });
        }

        // Default to accepting anything if the filter references a property and we don't have the `CodeSystem`'s hierarchy
        return z.any();
    }
}

/**
 * Creates a schema for a given `SystemInclude`.
 *
 * @param include The include to create a schema for.
 * @param resolveSchema A function for resolving a previously registered Zod schema by its name or URL.
 * @param defaultSchema The default schema to use if no other schema is found.
 * @returns An array of schemas for the given include.
 */
function createIncludeSchemasForSystem(
    include: SystemInclude,
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn,
    defaultSchema: z.Schema
): z.Schema[] {
    // The starting point is the system schema (the full CodeSystem)
    const systemSchema = resolveSchema(include.system);

    // The include might, however, specify a list of concepts from the referenced system,
    // in which case we can generate an enum that contains the exact included concepts and
    // we don't need to rely on a possibly "loosely defined" system schema (e.g. some of
    // the built-in CodeSystems are implemented as `z.string().min(1)` or some equally
    // liberal approximation instead of the actual codes defined in the system).
    const concepts = include.concept || [];
    if (concepts.length > 0) {
        const values = concepts.map((concept) => concept.code as string);
        if (values.length === 1) {
            return [z.literal(values[0])];
        } else if (values.length >= 2) {
            return [z.enum([values[0], values[1], ...values.slice(2)])];
        }
    }

    // If there were no explicit concepts listed, let's see if there are any filters defined.
    if (Array.isArray(include.filter) && include.filter.length > 0) {
        // TODO: implement FHIR ValueSet filter operators: https://hl7.org/fhir/valueset-filter-operator.html
        const filters = include.filter || [];
        const supportedOps = ["=", "regex", "in", "not-in", "is-a", "is-not-a", "descendent-of", "generalizes"];
        const supportedProps = ["code"]; // This is the only "standard" property. Filters might, however, be defined on other "custom" properties as well...
        const implemented = filters.filter(
            (f) => supportedOps.includes(f.op) /*&& supportedProps.includes(f.property) */
        );
        if (implemented.length > 0) {
            const filterSchema = andSchemas(
                implemented.map((f) => createFilterSchema(include.system, f, resolveResource))
            );
            if (systemSchema) {
                return [systemSchema.and(filterSchema)];
            } else {
                return [z.string().and(filterSchema)];
            }
        }
    }

    // If we get here, either there are no concepts or filters defined, or we don't support those filter types
    // so we'll just treat it like there were no filters defined at all. If we don't know anything about the
    // system these concepts come from, we'll default to the provided default schema.
    return [systemSchema || defaultSchema];
}

/**
 * Collects schemas for a given list of includes.
 *
 * @param includes The includes to collect schemas for.
 * @param resolveSchema A function for resolving a previously registered Zod schema by its name or URL.
 * @param defaultSchema The default schema to use if no other schema is found.
 * @returns An array of schemas for the given includes.
 */
function collectSchemas(
    includes: ValueSetComposeInclude[],
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn,
    defaultSchema: z.Schema
): z.Schema[] {
    const includedSchemas: z.Schema[] = [];
    includes.forEach((include: ValueSetComposeInclude) => {
        if (isValueSetInclude(include)) {
            includedSchemas.push(
                ...createIncludeSchemasForValueSet(include, resolveSchema, resolveResource, defaultSchema)
            );
        } else if (isSystemInclude(include)) {
            includedSchemas.push(
                ...createIncludeSchemasForSystem(include, resolveSchema, resolveResource, defaultSchema)
            );
        } else {
            throw new Error(`Invalid include element: ${JSON.stringify(include, null, 2)}`);
        }
    });
    return includedSchemas;
}

/**
 * Combines a list of schemas into a single schema.
 *
 * @param schemas The schemas to combine.
 * @returns A combined schema.
 */
function andSchemas(schemas: z.Schema[]): z.Schema {
    if (schemas.length === 0) {
        return z.never();
    } else if (schemas.length === 1) {
        return schemas[0];
    } else {
        return schemas.slice(1).reduce((acc, schema) => acc.and(schema), schemas[0]);
    }
}

/**
 * Combines a list of schemas into a single schema.
 *
 * @param schemas The schemas to combine.
 * @returns A combined schema.
 */
function orSchemas(schemas: z.Schema[]): z.Schema {
    if (schemas.length === 0) {
        return z.never();
    } else if (schemas.length === 1) {
        return schemas[0];
    } else {
        return schemas.slice(1).reduce((acc, schema) => acc.or(schema), schemas[0]);
    }
}

/**
 * Generates a schema for the includes of a given `ValueSet`.
 *
 * @param valueSet The value set to generate a schema for.
 * @param resolveSchema A function for resolving a previously registered Zod schema by its name or URL.
 * @returns A schema for the includes of the given value set.
 */
function generateSchemaForIncludes(
    valueSet: ValueSet,
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn
): z.Schema {
    const includes = valueSet.compose?.include || [];
    const schemas = collectSchemas(includes, resolveSchema, resolveResource, z.string().min(1));
    if (schemas.length === 0) {
        console.warn(
            `Could not contribute any schemas for ValueSet ${valueSet.url}: ${JSON.stringify(valueSet, null, 2)}`
        );
    }
    return orSchemas(schemas);
}

function generateSchemaForExcludes(
    valueSet: ValueSet,
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn
): z.Schema {
    const excludes = valueSet.compose?.exclude || [];
    const schemas = collectSchemas(excludes, resolveSchema, resolveResource, z.never());
    return andSchemas(schemas);
}

/**
 * Process a given resource file to contribute a schema to the larger context,
 * utilizing already processed files' respective schemas as building blocks.
 *
 * @param file `ResourceFile` The resource file to process.
 * @param resource `any` The parsed FHIR resource object.
 * @param contribute `function` for registering a new Zod schema.
 * @param resolveSchema `function` for resolving a previously registered Zod schema by its name or URL.
 * @param resolveResource `function` for resolving a previously registered FHIR resource by its name or URL.
 * @returns `void`
 */
export async function processResource(
    file: ResourceFile,
    resource: any,
    contribute: (resourceFile: ResourceFile, resource: any | undefined, schema: z.Schema) => void,
    resolveSchema: ResolveSchemaFn,
    resolveResource: ResolveResourceFn
) {
    if (file.resourceType !== "ValueSet") {
        throw new Error(`processResource: Expected a ValueSet, got a ${file.resourceType}`);
    }

    const valueset: ValueSet = resource;
    const combinedIncludeSchema = generateSchemaForIncludes(valueset, resolveSchema, resolveResource);
    const combinedExcludeSchema = generateSchemaForExcludes(valueset, resolveSchema, resolveResource);

    const combinedSchema = combinedIncludeSchema.superRefine(async (value, ctx) => {
        if ((await combinedExcludeSchema.safeParseAsync(value)).success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Value ${JSON.stringify(value)} is excluded from the ValueSet ${valueset.url}`,
            });
        }
    });

    contribute(file, valueset, combinedSchema);
}
