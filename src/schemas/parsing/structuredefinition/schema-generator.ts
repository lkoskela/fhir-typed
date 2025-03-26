import z from "zod";

import { StructureDefinition } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "../../types/index.js";
import { convertStructureDefinitionToIntermediateFormat } from "./intermediate-format.js";
import { convertToSchema } from "./conversion.js";

/**
 * Build a Zod schema for a given FHIR StructureDefinition of a primitive type like "uri" or "datetime".
 *
 * @param sd R4 StructureDefinition object.
 * @param resolveSchema Function to resolve a previously built schema by name or URL.
 * @returns The generated Zod schema.
 */
export function buildSchemaForPrimitiveType(
    sd: StructureDefinition,
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
): z.Schema {
    const valueNode = sd.snapshot?.element?.find((element) => element.path === `${sd.type}.value`);
    const firstType = valueNode?.type?.[0];
    const code = firstType?.code;
    const regex = firstType?.extension?.find(
        (ext) => ext.url === "http://hl7.org/fhir/StructureDefinition/regex"
    )?.valueString;

    let schema: z.Schema = z.string().min(1);
    if (regex) {
        schema = z.string().regex(new RegExp(regex), { message: `Value must match regex pattern: ${regex}` });
    } else if (code) {
        schema = resolveSchema(code) || schema;
    }
    if (sd.url === "http://hl7.org/fhir/StructureDefinition/boolean") {
        schema = schema.or(z.boolean());
    }
    return schema;
}

/**
 * Build a Zod schema for a given FHIR StructureDefinition of a complex type like "HumanName" or "Address".
 *
 * @param sd R4 StructureDefinition object.
 * @param resolveSchema Function to resolve a previously built schema by name or URL.
 * @returns The generated Zod schema.
 */
export async function buildSchemaForComplexType(
    sd: StructureDefinition,
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
): Promise<z.Schema> {
    try {
        const imf = convertStructureDefinitionToIntermediateFormat(sd);
        return (await convertToSchema(imf, resolveSchema)).superRefine((data: any, ctx: z.RefinementCtx) => {
            if (Object.keys(data).length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Object must have some content`,
                });
            }
        });
    } catch (error) {
        return z.any().optional();
    }
}

/**
 * Build a Zod schema for a given FHIR StructureDefinition.
 *
 * @param sd R4 StructureDefinition object.
 * @param resolveSchema Function to resolve a previously built schema by name or URL.
 * @returns The generated Zod schema.
 */
export async function buildSchemaForStructureDefinition(
    sd: StructureDefinition,
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
): Promise<z.Schema> {
    if (sd.kind === "primitive-type") {
        return buildSchemaForPrimitiveType(sd, resolveSchema);
    } else if (sd.kind === "complex-type" || sd.kind === "resource" || sd.kind === "logical") {
        return await buildSchemaForComplexType(sd, resolveSchema);
    }
    console.warn(`Building a schema for a StructureDefinition of kind "${sd.kind}" is not supported: ${sd.url}`);
    return z.any().optional();
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
    resolveSchema: (nameOrUrl: string) => undefined | z.Schema
) {
    if (file.resourceType === "StructureDefinition") {
        const schema = await buildSchemaForStructureDefinition(resource as StructureDefinition, resolveSchema);
        contribute(file, resource, schema);
    }
}
