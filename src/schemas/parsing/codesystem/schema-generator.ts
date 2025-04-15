import { z } from "zod";

import { CodeSystem, CodeSystemConcept, CodeSystemConceptProperty, Coding } from "@src/generated/FHIR-r4.js";
import { ResourceFile } from "../../types/index.js";
import console from "@src/utils/console.js";
import { ConceptHierarchy, ConceptHierarchyConcept, ConceptPropertyValue } from "@src/schemas/codesystems/hierarchy.js";

type HierarchicalCodeSystemConcept = {
    code: string;
    display?: string;
    property: CodeSystemConceptProperty[];
    ancestors: string[];
    descendants: HierarchicalCodeSystemConcept[];
};

function convertToHierarchicalCodeSystemConcept(
    concept: CodeSystemConcept,
    ancestors: string[] = []
): HierarchicalCodeSystemConcept {
    return {
        ancestors,
        code: concept.code,
        display: concept.display,
        property: concept.property ?? [],
        descendants: (concept.concept ?? []).map((child) =>
            convertToHierarchicalCodeSystemConcept(child, [...ancestors, concept.code])
        ),
    };
}

function simplifyHierarchicalCodeSystemConcept(codesystem: CodeSystem): ConceptHierarchy {
    function convertToConceptHierarchyConcept(root: HierarchicalCodeSystemConcept): ConceptHierarchyConcept {
        const properties: Record<string, ConceptPropertyValue> = {};
        root.property.forEach((p) => {
            properties[p.code] = {
                type: p.valueBoolean ? "boolean" : "string",
                value: p.valueBoolean || p.valueNumber || p.valueString || p.valueCoding || (p as any).valueCode!,
            };
        });
        return {
            code: root.code,
            properties,
            descendants: root.descendants.map(convertToConceptHierarchyConcept),
        };
    }
    const concepts = (codesystem.concept || []).map((concept) =>
        convertToConceptHierarchyConcept(convertToHierarchicalCodeSystemConcept(concept))
    );
    return {
        url: codesystem.url!,
        concepts: concepts,
    };
}

function extractAllCodesFromHierarchy(hierarchy: ConceptHierarchy): string[] {
    function extract(root: ConceptHierarchyConcept): string[] {
        return [root.code, ...root.descendants.flatMap(extract)];
    }
    return hierarchy.concepts.flatMap(extract);
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
    _resolveSchema: (nameOrUrl: string) => undefined | z.Schema,
    _resolveResource: (nameOrUrl: string) => undefined | any
) {
    if (file.resourceType !== "CodeSystem") {
        throw new Error(`processResource: Expected a CodeSystem, got a ${file.resourceType}`);
    }

    const codesystem: CodeSystem = resource;
    const name = codesystem.name;
    const url = codesystem.url;
    const concepts = codesystem.concept || [];
    if (codesystem.content === "complete") {
        const hierarchy = simplifyHierarchicalCodeSystemConcept(codesystem);
        const allowedValues = extractAllCodesFromHierarchy(hierarchy);
        const schema = z.enum([allowedValues[0], ...allowedValues.slice(1)]);
        contribute(file, hierarchy, schema);
    } else if (codesystem.content === "example") {
        // If the CodeSystem declares itself as an example, we shouldn't fail values
        // outside the provided concepts – the list exists just for example as the name implies.
        contribute(file, undefined, z.string().min(1));
    } else if (codesystem.content === "not-present") {
        // If the CodeSystem declares its content as 'not-present', we should validate
        // against an external source for the allowed values. Since we can't currently
        // do that, for now we'll just allow any non-empty string.
        contribute(file, undefined, z.string().min(1));
    } else if (codesystem.content === "fragment") {
        // If the CodeSystem declares itself as a fragment, we shouldn't fail values
        // outside the provided concepts – the list exists just for convenience.
        contribute(file, undefined, z.string().min(1));
    } else if (codesystem.content === "supplement") {
        // we'll just ignore "supplement" code systems for now
    } else {
        // Ignore and report unexpected code system types
        console.warn(
            `Ignoring an unexpected CodeSystem ${name} (${url}) with ${JSON.stringify(
                codesystem.content
            )} "content" field: ${JSON.stringify(codesystem, null, 4)}`
        );
        concepts.forEach((concept) => {
            console.warn(
                `  ${concept.code}\t${(concept.property || []).map((prop) => `${prop.code}: ${prop.valueBoolean}`)}`
            );
        });
    }
}
