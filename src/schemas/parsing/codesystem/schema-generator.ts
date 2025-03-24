import { z } from "zod";

import { CodeSystem } from "@src/generated/FHIR-r4.js";
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
    _resolveSchema: (nameOrUrl: string) => undefined | z.Schema
) {
    if (file.resourceType === "CodeSystem") {
        const codesystem: CodeSystem = resource;
        const name = codesystem.name;
        const url = codesystem.url;
        const concepts = codesystem.concept || [];
        if (codesystem.content === "complete") {
            const allowedValues = concepts.map((concept) => concept.code as string);
            const schema = z.enum([allowedValues[0], ...allowedValues.slice(1)]);
            contributeSchema(file, schema);
        } else if (codesystem.content === "example") {
            // If the CodeSystem declares itself as an example, we shouldn't fail values
            // outside the provided concepts – the list exists just for example as the name implies.
            contributeSchema(file, z.string().min(1));
        } else if (codesystem.content === "not-present") {
            // If the CodeSystem declares its content as 'not-present', we should validate
            // against an external source for the allowed values. Since we can't currently
            // do that, for now we'll just allow any non-empty string.
            contributeSchema(file, z.string().min(1));
        } else if (codesystem.content === "fragment") {
            // If the CodeSystem declares itself as a fragment, we shouldn't fail values
            // outside the provided concepts – the list exists just for convenience.
            contributeSchema(file, z.string().min(1));
        } else if (codesystem.content === "supplement") {
            // we'll just ignore "supplement" code systems for now
        } else {
            // Ignore and report unexpected code system types
            console.warn(`Ignoring an unexpected ${JSON.stringify(codesystem.content)} CodeSystem ${name} (${url})`);
            concepts.forEach((concept) => {
                console.warn(
                    `  ${concept.code}\t${(concept.property || []).map((prop) => `${prop.code}: ${prop.valueBoolean}`)}`
                );
            });
        }
    }
}
