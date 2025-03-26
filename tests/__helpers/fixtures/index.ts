import { tmpdir } from "os";
import { join } from "path";
import crypto from "crypto";

import { CodeSystem, ValueSet, ValueSetComposeInclude, ValueSetComposeIncludeConcept } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "@src/schemas/types/index.js";
import { capitalizeFirstLetter } from "@src/utils/strings.js";

import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { ZodSchema } from "zod";
import { processResource as processCodeSystem } from "@src/schemas/parsing/codesystem/schema-generator.js";
import { processResource as processValueSet } from "@src/schemas/parsing/valueset/schema-generator.js";
import { statSync, writeFileSync } from "fs";
import { sortResourceFilesByDependencies, sortResourceFilesByKind } from "@src/utils/sorting.js";

/**
 * File path to the root directory for fixtures related test assets and utilities.
 */
export const FIXTURES_DIR = join(__dirname, ".");

/**
 * Process a CodeSystem from a `ResourceFile`, generating the schema delivered via
 * the `contribute` callback function.
 *
 * @param file - The `ResourceFile` to process.
 * @param contribute - A function that will be called with the processed schema.
 * @param resolve - A function that will be called to resolve a name or URL to a schema.
 */
export async function processCodeSystemFromFile(
    file: ResourceFile,
    contribute: (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => void,
    resolveSchema: (nameOrUrl: string) => ZodSchema,
    resolveResource: (nameOrUrl: string) => undefined | any
) {
    const data = parseJsonFromFilePath(file.filePath);
    await processCodeSystem(file, data, contribute, resolveSchema, resolveResource);
}

/**
 * Process a ValueSet from a `ResourceFile`, generating the schema delivered via
 * the `contribute` callback function.
 *
 * @param file - The `ResourceFile` to process.
 * @param contribute - A function that will be called with the processed schema.
 * @param resolve - A function that will be called to resolve a name or URL to a schema.
 */
export async function processValueSetFromFile(
    file: ResourceFile,
    contribute: (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => void,
    resolveSchema: (nameOrUrl: string) => ZodSchema,
    resolveResource: (nameOrUrl: string) => undefined | any
) {
    const data = parseJsonFromFilePath(file.filePath);
    await processValueSet(file, data, contribute, resolveSchema, resolveResource);
}

/**
 * Process a list of `ResourceFile` objects, generating the schemas delivered via
 * the `contribute` callback function. The `ResourceFile` objects are sorted by
 * kind and by their dependencies, so that the `CodeSystem` objects are processed
 *  before the `ValueSet` objects that reference them and so forth.
 *
 * @param contribute - A function that will be called with the processed schema.
 * @param resolve - A function that will be called to resolve a name or URL to a schema.
 * @param resources - The list of `ResourceFile` objects to process.
 */
export async function processResources(
    contribute: (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => void,
    resolveSchema: (nameOrUrl: string) => ZodSchema,
    resolveResource: (nameOrUrl: string) => undefined | any,
    ...resources: ResourceFile[]
) {
    resources
        .sort(sortResourceFilesByKind)
        .sort(sortResourceFilesByDependencies(resources))
        .forEach(async (file) => {
            if (file.resourceType === "CodeSystem") {
                await processCodeSystemFromFile(file, contribute, resolveSchema, resolveResource);
            } else if (file.resourceType === "ValueSet") {
                await processValueSetFromFile(file, contribute, resolveSchema, resolveResource);
            }
        });
}

/**
 * Creates a `CodeSystem` with the given name and composed of the provided set
 * of concepts (codes).
 *
 * @param name Name for the code system.
 * @param codes The list of codes to build the code system's concepts from.
 * @returns `CodeSystem` with the requested content.
 */
export function codeSystem(name: string, codes: string[]): CodeSystem {
    return {
        resourceType: "CodeSystem",
        url: `http://example.org/fhir/CodeSystem/${name}`,
        id: name,
        name: name,
        version: "1.0.0",
        status: "active",
        content: "complete",
        concept: concepts(codes),
    };
}

/**
 * Creates a `ValueSet` with the given name and composed of the provided set
 * of concepts (codes).
 *
 * @param name Name for the code system.
 * @param codes The list of codes to build the code system's concepts from.
 * @returns `CodeSystem` with the requested content.
 */
export function valueSet(name: string, codes: string[], system?: string): ValueSet {
    const url = `http://example.org/fhir/ValueSet/${name}`;
    system = system || `urn:testing:${name}`;
    return {
        url,
        name,
        id: name,
        resourceType: "ValueSet",
        version: "1.0.0",
        status: "active",
        compose: {
            include: [
                {
                    system,
                    concept: concepts(codes),
                },
            ],
        },
    };
}

/**
 * Creates a `ValueSet` with the given name and composed of the provided set
 * of concepts (codes).
 *
 * @param name Name for the code system.
 * @param codes The list of codes to build the code system's concepts from.
 * @returns `CodeSystem` with the requested content.
 */
export function valueSetFromCodeSystem(codeSystem: CodeSystem | ResourceFile, codes?: string[]): ValueSet {
    if (codeSystem.resourceType !== "CodeSystem") {
        throw new Error(`Can't create a ValueSet from a non-CodeSystem object: ${JSON.stringify(codeSystem)}`);
    }
    if ((codeSystem as any).filePath) {
        const data = parseJsonFromFilePath((codeSystem as ResourceFile).filePath);
        return valueSetFromCodeSystem(data as CodeSystem, codes);
    }
    const name = codeSystem.name;
    const url = `http://example.org/fhir/ValueSet/${name}`;
    return {
        url,
        name,
        id: name,
        resourceType: "ValueSet",
        version: "1.0.0",
        status: "active",
        compose: {
            include: [
                {
                    system: codeSystem.url,
                    concept: codes ? concepts(codes) : undefined,
                },
            ],
        },
    };
}

type SystemAndCodes = {
    codeSystem: CodeSystem | ResourceFile;
    codes?: string[];
};

function coerceIntoCodeSystem(system: CodeSystem | ResourceFile): CodeSystem {
    if (system.resourceType !== "CodeSystem") {
        throw new Error(`Can't create a ValueSet from a non-CodeSystem object: ${JSON.stringify(system)}`);
    }
    if ((system as any).filePath) {
        return parseJsonFromFilePath((system as ResourceFile).filePath) as CodeSystem;
    } else {
        return system as CodeSystem;
    }
}

function createValueSetFromSystems(name: string, systems: SystemAndCodes[]): ValueSet {
    const url = `http://example.org/fhir/ValueSet/${name}`;
    return {
        url,
        name,
        id: name,
        resourceType: "ValueSet",
        version: "1.0.0",
        status: "active",
        compose: {
            include: systems
                .map((s: SystemAndCodes) => ({ ...s, codeSystem: coerceIntoCodeSystem(s.codeSystem) }))
                .map((s: SystemAndCodes) => ({
                    system: s.codeSystem.url,
                    concept: s.codes ? concepts(s.codes) : undefined,
                })),
        },
    };
}

function createValueSetFromValueSets(name: string, valuesets: ValueSet[]): ValueSet {
    const url = `http://example.org/fhir/ValueSet/${name}`;
    return {
        url,
        name,
        id: name,
        resourceType: "ValueSet",
        version: "1.0.0",
        status: "active",
        compose: {
            include: valuesets.map((s: ValueSet) => ({
                valueSet: [s.url as string],
            })),
        },
    };
}

function createValueSetFromSystemsAndValueSets(name: string, sources: Array<SystemAndCodes | ValueSet>): ValueSet {
    const url = `http://example.org/fhir/ValueSet/${name}`;
    return {
        url,
        name,
        id: name,
        resourceType: "ValueSet",
        version: "1.0.0",
        status: "active",
        compose: {
            include: sources.map((s: ValueSet | SystemAndCodes) => {
                if (isValueSet(s)) {
                    return { valueSet: [s.url as string] } satisfies ValueSetComposeInclude;
                } else {
                    return {
                        system: coerceIntoCodeSystem(s.codeSystem).url,
                        concept: s.codes ? concepts(s.codes) : undefined,
                    } satisfies ValueSetComposeInclude;
                }
            }),
        },
    };
}

/**
 * Creates a `ValueSet` with the given name and composed of the (optionally)
 * provided set of concepts (codes) from each `CodeSystem`.
 *
 * @param name Name for the code system.
 * @param codes The list of codes to build the code system's concepts from.
 * @returns `CodeSystem` with the requested content.
 */
export function valueSetFromCodeSystems(...systems: Array<SystemAndCodes>): ValueSet {
    if (systems.some((system) => system.codeSystem.resourceType !== "CodeSystem")) {
        throw new Error(
            `Can't create a ValueSet from non-CodeSystem objects: ${JSON.stringify(
                systems.map((s) => s.codeSystem.resourceType)
            )}`
        );
    }
    if (systems.length === 0) {
        throw new Error("Can't create a ValueSet from an empty array of code systems");
    }
    if (systems.length === 1) {
        const nameForValueSet = systems[0]!.codeSystem.name || hash(JSON.stringify(systems));
        return createValueSetFromSystems(nameForValueSet, systems);
    } else {
        const nameForValueSet = hash(JSON.stringify(systems));
        return createValueSetFromSystems(nameForValueSet, systems);
    }
}

function isSystemAndCodes(source: SystemAndCodes | ValueSet): source is SystemAndCodes {
    return (source as any)?.codeSystem?.resourceType === "CodeSystem";
}

function isValueSet(source: SystemAndCodes | ValueSet): source is ValueSet {
    return (source as any)?.resourceType === "ValueSet";
}

function isResourceFile(content: any): content is ResourceFile {
    return content.filePath !== undefined && content.resourceType !== undefined && content.url !== undefined;
}

/**
 * Creates a `ValueSet` with the given name and composed of the (optionally)
 * provided set of concepts (codes) from each `CodeSystem`.
 *
 * @param name Name for the code system.
 * @param codes The list of codes to build the code system's concepts from.
 * @returns `CodeSystem` with the requested content.
 */
export function valueSetFrom(...sources: Array<SystemAndCodes | ValueSet>): ValueSet {
    if (sources.some((src) => !isSystemAndCodes(src) && !isValueSet(src))) {
        throw new Error(`Can't create a ValueSet from non-CodeSystem objects: ${JSON.stringify(sources)}`);
    }
    if (sources.length === 0) {
        throw new Error("Can't create a ValueSet from an empty array of sources");
    } else if (sources.length === 1) {
        if (isSystemAndCodes(sources[0])) {
            const nameForValueSet = sources[0]!.codeSystem.name || hash(JSON.stringify(sources));
            return createValueSetFromSystems(nameForValueSet, sources as SystemAndCodes[]);
        } else {
            const nameForValueSet = sources[0]!.name || hash(JSON.stringify(sources));
            return createValueSetFromValueSets(nameForValueSet, sources as ValueSet[]);
        }
    } else {
        const nameForValueSet = hash(JSON.stringify(sources));
        return createValueSetFromSystemsAndValueSets(nameForValueSet, sources);
    }
}

/**
 * Create an array of `ValueSetComposeIncludeConcept` objects from the provided codes.
 *
 * @param codes Array of codes to generate concept objects from.
 * @returns `ValueSetComposeIncludeConcept[]`
 */
export function concepts(codes: string[]): ValueSetComposeIncludeConcept[] {
    return codes.map((code) => ({ code, display: capitalizeFirstLetter(code) }));
}

/**
 * Filter the codes of a `CodeSystem` according to the provided predicate.
 *
 * @param codeSystem The `CodeSystem` to filter.
 * @param predicate The predicate to filter the codes with.
 * @returns Array of codes that match the predicate.
 */
export function filterCodes(codeSystem: CodeSystem, predicate: (code: string) => boolean): string[] {
    const codes: string[] = codeSystem.concept?.map((c: any) => c.code as string) ?? [];
    return codes.filter(predicate);
}

/**
 * Create a (SHA1) hash of the provided content.
 *
 * @param content The content to hash.
 * @returns The hash of the content.
 */
function hash(content: any): string {
    return crypto.createHash("sha1").update(JSON.stringify(content)).digest("hex");
}

/**
 * Create a `ResourceFile` from the provided content, writing the contents to a
 * temporary file so that processing the `ResourceFile` is possible.
 *
 * @param content The resource object (FHIR JSON resource or data type)
 * @returns `ResourceFile`
 */
export function resourceFile(content: any): ResourceFile {
    if (isResourceFile(content)) {
        if (statSync(content.filePath).isFile()) {
            console.warn(`WARN: Passed an existing ResourceFile to resourceFile(): ${content.filePath}`);
            return content;
        }
        throw new Error(`Can't create a ResourceFile - content is already a ResourceFile: ${JSON.stringify(content)}`);
    }
    const id = hash(content);
    const filePath = join(tmpdir(), `${id}.json`);
    writeFileSync(filePath, JSON.stringify(content, null, 2));
    return {
        resourceType: content.resourceType,
        url: content.url || `http://example.org/fhir/${content.resourceType}/${id}`,
        name: content.name || content.id || id,
        filePath,
    } satisfies ResourceFile;
}

function parseCodeSystemFromDisk(filePath: string): CodeSystem {
    const fullPath = join(FIXTURES_DIR, "codesystems", filePath);
    return parseJsonFromFilePath(fullPath) as CodeSystem;
}

/**
 * The Greek alphabet as a FHIR `CodeSystem`.
 */
export const GreekAlphabetCodeSystem = parseCodeSystemFromDisk("greek-alphabet.json");

/**
 * The Greek alphabet as a FHIR `CodeSystem` but only containing codes with fewer than 4 characters.
 */
export const ShortGreekAlphabetCodeSystem = parseCodeSystemFromDisk("only-short-greek-alphabet.json");

/**
 * The Greek alphabet as a FHIR `CodeSystem` but only containing codes with more than 6 characters.
 */
export const LongGreekAlphabetCodeSystem = parseCodeSystemFromDisk("only-long-greek-alphabet.json");

/**
 * The Greek alphabet as a FHIR `ValueSet` (referencing `GreekAlphabetCodeSystem`).
 */
export const GreekAlphabetValueSet = valueSetFromCodeSystem(GreekAlphabetCodeSystem);

/**
 * The Finnish alphabet as a FHIR `CodeSystem`.
 */
export const FinnishAlphabetCodeSystem = codeSystem("FinnishAlphabet", "abcdefghijklmnopqrstuvwxyzåäö".split(""));

/**
 * The Finnish alphabet as a FHIR `ValueSet` (referencing `FinnishAlphabetCodeSystem`).
 */
export const FinnishAlphabetValueSet = valueSetFromCodeSystem(FinnishAlphabetCodeSystem);

/**
 * The English alphabet as a FHIR `CodeSystem`.
 */
export const EnglishAlphabetCodeSystem = codeSystem("AmericanAlphabet", "abcdefghijklmnopqrstuvwxyz".split(""));

/**
 * The English alphabet as a FHIR `ValueSet` (referencing `EnglishAlphabetCodeSystem`).
 */
export const EnglishAlphabetValueSet = valueSetFromCodeSystem(EnglishAlphabetCodeSystem);
