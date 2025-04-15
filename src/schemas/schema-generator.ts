import { z } from "zod";

import { Schemas, ResourceFile } from "./types/index.js";

import console from "@src/utils/console.js";
import { sortResourceFilesByDependencies } from "@src/utils/sorting.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { ResourceObject } from "@src/schemas/utils/dependencies.js";
import { unique } from "@src/utils/arrays.js";
import { contributeBuiltInSchemas } from "./codesystems/built-ins.js";
import { DefaultResourceLoader } from "@src/packages/resource-loader.js";

import { processResource as processCodeSystemResource } from "./parsing/codesystem/schema-generator.js";
import { processResource as processValueSetResource } from "./parsing/valueset/schema-generator.js";
import { processResource as processStructureDefinitionResource } from "./parsing/structuredefinition/schema-generator.js";

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
async function processResource(
    file: ResourceFile,
    resource: any,
    contribute: (resourceFile: ResourceFile, resource: any|undefined, schema: z.Schema) => void,
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema,
    resolveResource: (nameOrUrl: string) => undefined | any
) {
    if (file.resourceType === "StructureDefinition") {
        processStructureDefinitionResource(file, resource, contribute, resolveSchema);
    } else if (file.resourceType === "ValueSet") {
        processValueSetResource(file, resource, contribute, resolveSchema, resolveResource);
    } else if (file.resourceType === "CodeSystem") {
        processCodeSystemResource(file, resource, contribute, resolveSchema, resolveResource);
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
    const resources: Record<string, any> = {};

    const assignSchema = (urlOrName: string | string[], schema: z.Schema) => {
        if (Array.isArray(urlOrName)) {
            urlOrName.forEach((url) => assignSchema(url, schema));
        } else {
            results[urlOrName] = schema;
        }
    };

    const assignSchemaForResourceFile = (resourceFile: ResourceFile, resource: any, schema: z.Schema) => {
        (schema as any).__source = (schema as any).__source || resourceFile.filePath;

        if (resourceFile.resourceType === "CodeSystem") {
            resources[resourceFile.url] = resource;
        }
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

    const resolveResource = (nameOrUrl: string): undefined | any => {
        const resource = resources[nameOrUrl];
        if (resource?.resourceType === "CodeSystem") {
            return resource;
        }
        return undefined;
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
        await processResource(file, resource, assignSchemaForResourceFile, schemaResolver, resolveResource);
    }

    return await Promise.resolve({ ...Schemas, ...results });
}

export async function generateZodSchemasForPackages(...pkgs: string[]): Promise<Record<string, z.Schema>> {
    const resourceLoader = new DefaultResourceLoader();
    await resourceLoader.loadPackages(...pkgs);
    const resourceFiles = await resourceLoader.getResourceFiles();
    return await generateZodSchemasForResourceFiles(resourceFiles);
}
