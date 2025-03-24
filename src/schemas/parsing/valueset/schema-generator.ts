import { z } from "zod";

import { ValueSet, ValueSetComposeInclude } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "../../types/index.js";
import console from "@src/utils/console.js";

type ResolveFn = (nameOrUrl: string) => undefined | z.Schema;

function collectSchemas(
    includes: ValueSetComposeInclude[],
    resolveSchema: ResolveFn,
    defaultSchema: z.Schema
): z.Schema[] {
    const includedSchemas: z.Schema[] = [];
    includes.forEach((include: ValueSetComposeInclude) => {
        // TODO: implement FHIR ValueSet filter operators: https://hl7.org/fhir/valueset-filter-operator.html
        const filter = (include.filter || []).map((f) => JSON.stringify([f.property, f.op, f.value])).join(" and ");
        if (include.valueSet && include.valueSet.length > 0) {
            if (typeof include.valueSet.map !== "function") {
                console.warn(`ValueSet.include.valueSet is not a function: ${JSON.stringify(include, null, 2)}`);
            }
            const schemas = include.valueSet.map((url) => resolveSchema(url)).map((schema) => schema || defaultSchema);
            // TODO: apply any defines filters to these included schemas, using a refinement
            includedSchemas.push(...schemas);
        } else if (include.system) {
            const concepts = include.concept || [];
            if (concepts.length > 0) {
                // the include specifies a list of concepts from the referenced system,
                // so we can generate an enum instead of dereferencing a hopefully
                // already parsed schema or falling back to an "anything goes" string.
                const values = concepts.map((concept) => concept.code as string);
                // TODO: apply any defines filters to these included concepts

                if (values.length === 1) {
                    includedSchemas.push(z.literal(values[0]));
                } else if (values.length >= 2) {
                    includedSchemas.push(z.enum([values[0], values[1], ...values.slice(2)]));
                }
            } else {
                const systemSchema = resolveSchema(include.system);
                if (systemSchema) {
                    includedSchemas.push(systemSchema);
                } else {
                    // If we don't know anything about the system these concepts come from, anything goes...
                    includedSchemas.push(defaultSchema);
                }
            }
        } else {
            // This is an error - an "include" SHOULD have either a system or reference one or more ValueSets!
            const str = JSON.stringify(include, null, 2);
            console.warn(`ValueSet has an include without a system or ValueSet: ${str}`);
        }
    });
    return includedSchemas;
}

function combineSchemas(schemas: z.Schema[]): z.Schema {
    if (schemas.length === 0) {
        return z.never();
    } else if (schemas.length === 1) {
        return schemas[0];
    } else {
        return schemas.slice(1).reduce((acc, schema) => acc.or(schema), schemas[0]);
    }
}

function generateSchemaForIncludes(valueSet: ValueSet, resolveSchema: ResolveFn): z.Schema {
    const includes = valueSet.compose?.include || [];
    const schemas = collectSchemas(includes, resolveSchema, z.string().min(1));
    if (schemas.length === 0) {
        console.warn(
            `Could not contribute any schemas for ValueSet ${valueSet.url}: ${JSON.stringify(valueSet, null, 2)}`
        );
    }
    return combineSchemas(schemas);
}

function generateSchemaForExcludes(valueSet: ValueSet, resolveSchema: ResolveFn): z.Schema {
    const excludes = valueSet.compose?.exclude || [];
    const schemas = collectSchemas(excludes, resolveSchema, z.never());
    return combineSchemas(schemas);
}

/**
 * Process a given resource file to contribute a schema to the larger context,
 * utilizing already processed files' respective schemas as building blocks.
 *
 * @param file `ResourceFile` The resource file to process.
 * @param resource `any` The parsed FHIR resource object.
 * @param contributeSchema `function` for registering a new Zod schema.
 * @param resolveSchema `function` for resolving a previously registered Zod schema by its name or URL.
 * @returns `void`
 */
export async function processResource(
    file: ResourceFile,
    resource: any,
    contributeSchema: (resourceFile: ResourceFile, schema: z.Schema) => void,
    resolveSchema: ResolveFn
) {
    if (file.resourceType !== "ValueSet") {
        throw new Error(`processResource: Expected a ValueSet, got a ${file.resourceType}`);
    }

    const valueset: ValueSet = resource;
    const combinedIncludeSchema = generateSchemaForIncludes(valueset, resolveSchema);
    const combinedExcludeSchema = generateSchemaForExcludes(valueset, resolveSchema);

    const combinedSchema = combinedIncludeSchema.superRefine(async (value, ctx) => {
        if ((await combinedExcludeSchema.safeParseAsync(value)).success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Value ${JSON.stringify(value)} is excluded from the ValueSet ${valueset.url}`,
            });
        }
    });

    contributeSchema(file, combinedSchema);
}
