import { tmpdir } from "os";
import { join } from "path";
import crypto from "crypto";

import { CodeSystem, ValueSet, ValueSetComposeIncludeConcept } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "@src/schemas/types/index.js";
import { capitalizeFirstLetter } from "@src/utils/strings.js";

import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { ZodSchema } from "zod";
import { processResource as processCodeSystem } from "@src/schemas/parsing/codesystem/schema-generator.js";
import { processResource as processValueSet } from "@src/schemas/parsing/valueset/schema-generator.js";
import { writeFileSync } from "fs";

export async function processCodeSystemFromFile(
    file: ResourceFile,
    contribute: (rf: ResourceFile, schema: ZodSchema) => void,
    resolve: (nameOrUrl: string) => ZodSchema
) {
    const data = parseJsonFromFilePath(file.filePath);
    await processCodeSystem(file, data, contribute, resolve);
}

export async function processValueSetFromFile(
    file: ResourceFile,
    contribute: (rf: ResourceFile, schema: ZodSchema) => void,
    resolve: (nameOrUrl: string) => ZodSchema
) {
    const data = parseJsonFromFilePath(file.filePath);
    await processValueSet(file, data, contribute, resolve);
}

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

export function valueSet(name: string, codes: string[]): ValueSet {
    return {
        resourceType: "ValueSet",
        url: `http://example.org/fhir/ValueSet/${name}`,
        id: name,
        name: name,
        version: "1.0.0",
        status: "active",
        compose: {
            include: [
                {
                    system: "urn:whatever-system",
                    concept: concepts(codes),
                },
            ],
        },
    };
}

export function concepts(codes: string[]): ValueSetComposeIncludeConcept[] {
    return codes.map((code) => ({ code, display: capitalizeFirstLetter(code) }));
}

export function filterCodes(codeSystem: CodeSystem, predicate: (code: string) => boolean): string[] {
    const codes: string[] = codeSystem.concept?.map((c: any) => c.code as string) ?? [];
    return codes.filter(predicate);
}

function hash(content: any): string {
    return crypto.createHash("sha1").update(JSON.stringify(content)).digest("hex");
}

export function resourceFile(content: any): ResourceFile {
    const id = hash(content);
    const filePath = join(tmpdir(), `${id}.json`);
    writeFileSync(filePath, JSON.stringify(content, null, 2));
    return {
        resourceType: content.resourceType,
        url: `http://example.org/fhir/${content.resourceType}/${id}`,
        name: `${content.resourceType}-${content.name || content.id || id}`,
        filePath,
    } satisfies ResourceFile;
}

export const GreekAlphabetCodeSystem = codeSystem("GreekAlphabet", [
    "alpha",
    "beta",
    "gamma",
    "delta",
    "epsilon",
    "zeta",
    "eta",
    "theta",
    "iota",
    "kappa",
    "lambda",
    "mu",
    "nu",
    "xi",
    "omicron",
    "pi",
    "rho",
    "sigma",
    "tau",
    "upsilon",
    "phi",
    "chi",
    "psi",
    "omega",
]);
