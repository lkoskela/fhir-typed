import { z } from "zod";

import { ValueSet } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "../../types/index.js";
import console from "@src/utils/console.js";

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
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
) {
    if (file.resourceType === "ValueSet") {
        const valueset: ValueSet = resource;
        const excludes = valueset.compose?.exclude || [];
        const includes = valueset.compose?.include || [];

        const includedValueSetSchemas: z.Schema[] = [];
        includes.forEach((include) => {
            // TODO: implement FHIR ValueSet filter operators: https://hl7.org/fhir/valueset-filter-operator.html
            const filter = (include.filter || []).map((f) => JSON.stringify([f.property, f.op, f.value])).join(" and ");
            if (include.valueSet && include.valueSet.length > 0) {
                const schemas = include.valueSet
                    .map((url) => resolveSchema(url))
                    .map((schema) => schema || z.string().min(1));
                includedValueSetSchemas.push(...schemas);
            }
            if (include.system) {
                const concepts = include.concept || [];
                if (concepts.length > 0) {
                    // the include specifies a list of concepts from the referenced system,
                    // so we can generate an enum instead of dereferencing a hopefully
                    // already parsed schema or falling back to an "anything goes" string.
                    const values = concepts.map((concept) => concept.code as string);
                    if (values.length === 1) {
                        includedValueSetSchemas.push(z.literal(values[0]));
                    } else if (values.length >= 2) {
                        includedValueSetSchemas.push(z.enum([values[0], values[1], ...values.slice(2)]));
                    }
                } else {
                    const systemSchema = resolveSchema(include.system);
                    if (systemSchema) {
                        includedValueSetSchemas.push(systemSchema);
                    } else {
                        // TODO: resolve the schema for an external system reference from
                        // a list of hard-coded or dynamically loaded external CodeSystems.
                        // For now, anything goes...
                        includedValueSetSchemas.push(z.string().min(1));
                    }
                }
            }
        });
        if (includedValueSetSchemas.length === 1) {
            contributeSchema(file, includedValueSetSchemas[0]);
        } else if (includedValueSetSchemas.length > 1) {
            contributeSchema(
                file,
                z.union([includedValueSetSchemas[0], includedValueSetSchemas[1], ...includedValueSetSchemas.slice(2)])
            );
        } else {
            console.warn(
                `Could not contribute any schemas for ValueSet ${valueset.url}: ${JSON.stringify(valueset, null, 2)}`
            );
        }
    }
}
