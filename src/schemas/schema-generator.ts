import { z } from "zod";

import { CodeSystem, StructureDefinition, ValueSet } from "@src/generated/FHIR-r4.js";

import { Schemas, ResourceFile } from "./types/index.js";

import console from "@src/utils/console.js";
import { sortResourceFilesByDependencies } from "@src/utils/sorting.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { ResourceObject } from "@src/schemas/utils/dependencies.js";
import { unique } from "@src/utils/arrays.js";
import { contributeBuiltInSchemas } from "./codesystems/built-ins.js";
import { buildSchemaForStructureDefinition } from "./parsing/structuredefinition/structuredefinition.js";
import { DefaultResourceLoader, ResourceLoader } from "@src/packages/resource-loader.js";

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
async function processResource(
    file: ResourceFile,
    resource: any,
    contributeSchema: (resourceFile: ResourceFile, schema: z.Schema) => void,
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
) {
    if (file.resourceType === "StructureDefinition") {
        const sd = resource as StructureDefinition;
        contributeSchema(file, await buildSchemaForStructureDefinition(sd, resolveSchema));
    } else if (file.resourceType === "ValueSet") {
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
                // console.log(
                //   `  ValueSet ${valueset.url} includes ${
                //     include.valueSet.length
                //   } value sets (${include.valueSet.join(", ")}) ${
                //     filter ? ` with filter ${filter}` : ""
                //   }` +
                //     ` (${schemas.length}/${include.valueSet.length} schemas resolved)`
                // );
            }
            if (include.system) {
                const concepts = include.concept || [];
                if (concepts.length > 0) {
                    // console.log(
                    //   `  ValueSet ${valueset.url} defines ${
                    //     concepts.length
                    //   } concepts to include from system ${include.system}${
                    //     filter ? ` with filter ${filter}` : ""
                    //   }`
                    // );
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
                    // console.log(
                    //   `  ValueSet ${valueset.url} includes system ${include.system}${
                    //     filter ? ` with filter ${filter}` : ""
                    //   }`
                    // );
                    const systemSchema = resolveSchema(include.system);
                    if (systemSchema) {
                        includedValueSetSchemas.push(systemSchema);
                    } else {
                        // console.warn(
                        //   `  Could not resolve schema for system ${include.system} - allowing any non-empty string`
                        // );
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
            console.log(
                `Could not contribute any schemas for ValueSet ${valueset.url}: ${JSON.stringify(valueset, null, 2)}`
            );
        }
    } else if (file.resourceType === "CodeSystem") {
        const codesystem: CodeSystem = resource;
        const name = codesystem.name;
        const url = codesystem.url;
        const concepts = codesystem.concept || [];
        const properties = codesystem.property || [];
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
            // console.log(
            //     `TODO: Ignoring supplementary CodeSystem ${name} (${url}) which supplements ${
            //         concepts.length
            //     } concepts with ${properties.length} property in ${JSON.stringify(codesystem.supplements)}`
            // );
        } else {
            // Ignore and report unexpected code system types
            console.warn(`Ignoring ${JSON.stringify(codesystem.content)} CodeSystem ${name} (${url})`);
            concepts.forEach((concept) => {
                const code = concept.code;
                console.warn(
                    `  ${code}\t${(concept.property || []).map((prop) => `${prop.code}: ${prop.valueBoolean}`)}`
                );
            });
        }
    }
}

/**
 * Trim the given list of resource files by removing overlapping definitions
 * that specify the same logical structure.
 *
 * Sometimes there are multiple definitions for the same resource URL, but only
 * some of them are active, older versions succeeded by a newer one, etc.
 *
 * @param resourceFiles
 * @returns
 */
function removeOverlappingDefinitions(resourceFiles: ResourceFile[]): ResourceFile[] {
    function filterNonRetiredOnly(file: EnrichedResourceFile): boolean {
        return file.data.status !== "retired";
    }

    function filterActiveOnly(file: EnrichedResourceFile): boolean {
        return file.data.status === "active";
    }

    function filterNonExperimentalOnly(file: EnrichedResourceFile): boolean {
        return file.data.experimental === false;
    }

    const sortEnrichedFilesMostRecentFirst = (a: EnrichedResourceFile, b: EnrichedResourceFile): number => {
        if (a.data.date && b.data.date) {
            return b.data.date.localeCompare(a.data.date);
        } else {
            return 0;
        }
    };

    type EnrichedResourceFile = {
        file: ResourceFile;
        data: ResourceObject;
    };

    type EnrichedResourceFileFilter = (file: EnrichedResourceFile) => boolean;

    const uniqueUrls = unique(resourceFiles.map((file) => file.url));
    const trimmedResourceFiles = uniqueUrls.flatMap((url) => {
        const overlappingFiles = resourceFiles.filter((file) => file.url === url);
        if (overlappingFiles.length === 1) {
            // If there's no overlap, just return the one-file array
            return overlappingFiles;
        }

        // If there are multiple files with the same URL, we'll need to
        // pick one of them to process. We'll first see if there is only one active
        // file, and if so, we'll use that one, ignoring those marked as draft.

        let enrichedFiles = overlappingFiles.map((file: ResourceFile) => {
            return {
                file,
                data: parseJsonFromFilePath(file.filePath) as ResourceObject,
            } satisfies EnrichedResourceFile;
        });

        function filterEnrichedFiles(
            files: EnrichedResourceFile[],
            ...filterFunctions: EnrichedResourceFileFilter[]
        ): EnrichedResourceFile[] {
            if (files.length > 1) {
                const filterFunction = filterFunctions[0];
                const subset = enrichedFiles.filter(filterFunction);
                if (subset.length === enrichedFiles.length) {
                    if (filterFunctions.length > 1) {
                        return filterEnrichedFiles(subset, ...filterFunctions.slice(1));
                    }
                } else if (subset.length === 1) {
                    return subset.slice(0, 1);
                } else if (subset.length > 1) {
                    if (filterFunctions.length > 1) {
                        return filterEnrichedFiles(subset, ...filterFunctions.slice(1));
                    }
                }
            }
            return files;
        }

        enrichedFiles = filterEnrichedFiles(
            enrichedFiles,
            filterActiveOnly,
            filterNonRetiredOnly,
            filterNonExperimentalOnly
        );

        if (enrichedFiles.length === 1) {
            return enrichedFiles[0].file;
        } else {
            enrichedFiles = enrichedFiles.sort(sortEnrichedFilesMostRecentFirst);
            return enrichedFiles[0].file;
        }
    });

    return trimmedResourceFiles;
}

/**
 * Parse the given resource files and generate runtime-validating schemas for them,
 * keyed by their URL or name.
 *
 * @param resourceFiles
 * @returns
 */
export async function generateZodSchemasForResourceFiles(
    resourceFiles: ResourceFile[]
): Promise<Record<string, z.Schema>> {
    // First, remove overlapping definitions, keeping only the most recent/active one
    resourceFiles = removeOverlappingDefinitions(resourceFiles);

    const results: Record<string, z.Schema> = { ...Schemas };

    const assignSchema = (urlOrName: string | string[], schema: z.Schema) => {
        if (Array.isArray(urlOrName)) {
            urlOrName.forEach((url) => assignSchema(url, schema));
        } else {
            results[urlOrName] = schema;
        }
    };

    const assignSchemaForResourceFile = (resourceFile: ResourceFile, schema: z.Schema) => {
        // console.log(`Assigning schema for ${resourceFile.url} from ${resourceFile.filePath} (was ${JSON.stringify((schema as any).__source)})`);
        (schema as any).__source = (schema as any).__source || resourceFile.filePath;

        assignSchema(resourceFile.url, schema);

        // Also assign the same schema to the resource's name as a kind of shorthand
        // if the resource is a StructureDefinition of a complex type defining one
        // of the standard FHIR data types:
        if (
            resourceFile.name &&
            resourceFile.resourceType === "StructureDefinition" &&
            resourceFile.kind === "complex-type" &&
            resourceFile.baseDefinition === "http://hl7.org/fhir/StructureDefinition/DataType"
        ) {
            assignSchema(resourceFile.name, schema);
        }
    };

    const resolveSchema = (nameOrUrl: string, context: ResourceFile): undefined | z.Schema => {
        const schema = results[nameOrUrl] || results[`http://hl7.org/fhir/StructureDefinition/${nameOrUrl}`];
        if (schema === undefined && nameOrUrl === "Meta") {
            console.warn(
                `resolveSchema(${JSON.stringify(nameOrUrl)}, ${JSON.stringify(
                    context.url
                )}) could not find a schema among ${JSON.stringify(Object.keys(results))}`
            );
        }
        return schema;
    };

    // Collect a set of built-in "external" ValueSets referred to via system references,
    // such as "http://unitsofmeasure.org" or "http://loinc.org"
    contributeBuiltInSchemas(assignSchema);

    const dependencySortedResourceFiles = resourceFiles.sort(sortResourceFilesByDependencies(resourceFiles));

    for (const file of dependencySortedResourceFiles) {
        const resource = parseJsonFromFilePath(file.filePath) as any;
        const schemaResolver: (nameOrUrl: string) => undefined | z.Schema = (nameOrUrl: string) => {
            return resolveSchema(nameOrUrl, file);
        };
        await processResource(file, resource, assignSchemaForResourceFile, schemaResolver);
    }

    return await Promise.resolve({ ...Schemas, ...results });
}

export async function generateZodSchemasForPackages(...pkgs: string[]): Promise<Record<string, z.Schema>> {
    const resourceLoader = new DefaultResourceLoader();
    await resourceLoader.loadPackages(...pkgs);
    const resourceFiles = await resourceLoader.getResourceFiles();
    return await generateZodSchemasForResourceFiles(resourceFiles);
}
