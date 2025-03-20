import { DefaultResourceLoader, ResourceLoader } from "@src/packages/resource-loader.js";
import { generateZodSchemasForResourceFiles } from "@src/schemas/schema-generator.js";
import { ResourceFile } from "@src/schemas/types/index.js";
import { unique } from "@src/utils/arrays.js";
import { pluralize } from "@src/utils/strings.js";
import { readFileSync, statSync, existsSync } from "fs";
import { globSync } from "glob";
import { sep } from "path";
import { ZodSchema } from "zod";

/**
 * Read a JSON file into a JavaScript object.
 */
const readJSONFromFilePath = (filePath: string) => {
    return JSON.parse(readFileSync(filePath, "utf-8"));
};

/**
 * Check if the given `string` is a file path to an existing file.
 *
 * @param str `string` - the resource to check.
 * @returns `boolean` - true if the resource is a file path, false otherwise.
 */
const isFilePath = (str: string): boolean => {
    return existsSync(str) && statSync(str).isFile();
};

/**
 * Check if the given `string` is a file path to an existing directory.
 *
 * @param str `string` - the resource to check.
 * @returns `boolean` - true if the resource is a file path to an existing directory, false otherwise.
 */
const isDirectoryPath = (str: string): boolean => {
    return existsSync(str) && statSync(str).isDirectory();
};

/**
 * Validation results.
 */
export type ValidationResult = {
    success: boolean;
    errors?: string[];
    data?: any;
};

/**
 * Options for validating FHIR resources.
 */
export type ValidateOptions = {
    /**
     * Profiles to validate the resource against, even if the resource itself doesn't declare conformance to these profiles.
     */
    profiles?: string[];

    /**
     * Ignore any profiles declared in the resource's `meta.profile` field.
     */
    ignoreSelfDeclaredProfiles?: boolean;

    /**
     * Ignore any schemas that are not recognized. (Default: false, i.e. unknown schemas are considered validation errors)
     */
    ignoreUnknownSchemas?: boolean;
};

/**
 * The `FhirValidator` can be used to validate FHIR resources against a set of FHIR packages
 * downloaded/accessed from the public FHIR package registry.
 */
export class FhirValidator {
    private loadedFiles: Promise<ResourceFile[]> = Promise.resolve([]);
    private loadedSchemas: Promise<Record<string, ZodSchema>> = Promise.resolve({});
    private resourceLoader: ResourceLoader;

    /**
     * Create a new FHIR validator.
     *
     * @param packages `string[]` - a set of FHIR packages to load.
     */
    constructor(packages?: string[], resourceLoader?: ResourceLoader) {
        this.resourceLoader = resourceLoader || new DefaultResourceLoader();
        this.loadPackages(...(packages || []));
    }

    async recognizes(nameOrUrl: string): Promise<boolean> {
        const schemas = await this.loadedSchemas;
        return schemas[nameOrUrl] !== undefined;
        // return this.loadedFiles.then((files) => {
        //     return files.some((file: ResourceFile) => {
        //         return file.url === nameOrUrl;
        //     });
        // });
    }

    /**
     * Load a FHIR package from the public NPM registry to validate resources against.
     *
     * @param packageNames `array` of `string` package name with an optional version number separated by an
     *                    exclamation mark, e.g. "hl7.fhir.r4.core!4.0.1" or "hl7.fhir.fi.base" or "hl7.fhir.fi.base!latest".
     */
    async loadPackages(...packageNames: string[]) {
        this.loadedFiles = this.loadedFiles.then(async (previousFiles) => {
            const newResourceFiles = await this.resourceLoader.loadPackages(...packageNames);
            return [...previousFiles, ...newResourceFiles];
        });
        return await this.startGeneratingSchemas();
    }

    /**
     * Load StructureDefinitions to validate resources against from a local directory.
     *
     * @param filePaths `string` Paths to StructureDefinition files or directories containing FHIR StructureDefinitions.
     */
    async loadFiles(...filePaths: string[]) {
        for (const filePath of filePaths) {
            if (isFilePath(filePath)) {
                this.loadedFiles = this.loadedFiles.then(async (previousFiles) => {
                    const newResourceFiles = await this.resourceLoader.loadFiles(filePath);
                    return [...previousFiles, ...newResourceFiles];
                });
            } else if (isDirectoryPath(filePath)) {
                const newFiles = globSync(`${filePath}${sep}**${sep}*.json`);
                this.loadedFiles = this.loadedFiles.then(async (previousFiles) => {
                    const newResourceFiles = await this.resourceLoader.loadFiles(...newFiles);
                    return [...previousFiles, ...newResourceFiles];
                });
            }
        }
        return await this.startGeneratingSchemas();
    }

    private async startGeneratingSchemas() {
        this.loadedSchemas = this.loadedFiles.then(generateZodSchemasForResourceFiles);
        await this.loadedSchemas;
    }

    /**
     * Validate the given FHIR resource against its self-declared profiles or, if provided,
     * against profiles provided as arguments.
     *
     * @param resource `string` or `object` - the resource to validate, either as a file path,
     *                 a string containing JSON, or a JavaScript object parsed from JSON.
     * @param options `ValidateOptions` - instructions such as which profiles to validate
     *                 the resource against.
     */
    async validate(resource: string | object, options?: ValidateOptions): Promise<ValidationResult> {
        const schemas = await this.loadedSchemas;
        if (Object.keys(schemas).length === 0) {
            return { success: false, errors: [`${pluralize(Object.keys(schemas).length, "schema")} loaded`] };
        }

        if (typeof resource === "string") {
            if (isFilePath(resource)) {
                resource = readJSONFromFilePath(resource);
            } else {
                try {
                    resource = JSON.parse(resource);
                } catch {
                    // Ok, the input isn't JSON, so we'll just pass it through as-is
                }
            }
        }
        await Promise.all([this.loadedFiles, this.loadedSchemas]);
        const profiles = [
            ...(options?.profiles || []),
            ...(options?.ignoreSelfDeclaredProfiles ? [] : (resource as any).meta?.profile || []),
        ];

        const resourceUrl = (resource as any).url;
        if (resourceUrl) {
            profiles.push(resourceUrl);
        }
        const errors = (
            await Promise.all(
                profiles.map(async (profile) => {
                    const schema = schemas[profile];
                    if (schema) {
                        const result = await schema.safeParseAsync(resource);
                        if (!result.success) {
                            return result.error.issues.map((issue) => issue.message);
                        } else {
                            return [];
                        }
                    } else if (options?.ignoreUnknownSchemas) {
                        return [];
                    } else {
                        const optionsUsage = `set \`ignoreUnknownSchemas: true\` to ignore unknown schemas`;
                        return [`Could not find schema for ${profile} (${optionsUsage})`];
                    }
                })
            )
        ).flat();

        const success = errors.length === 0;
        if (success) {
            return { success: true, data: resource };
        } else {
            return { success: false, errors: unique(errors) };
        }
    }
}
