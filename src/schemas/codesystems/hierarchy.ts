import { Coding } from "@src/generated/FHIR-r4.js";

export type ConceptPropertyValue = {
    type: "code" | "string" | "boolean" | "integer" | "decimal" | "Coding";
    value: string | boolean | number | Coding;
};

export type ConceptHierarchyConcept = {
    code: string;
    properties: Record<string, ConceptPropertyValue>;
    descendants: ConceptHierarchyConcept[];
};

export type ConceptHierarchy = {
    url: string;
    concepts: ConceptHierarchyConcept[];
};

export function isConceptHierarchy(x: any | undefined): x is ConceptHierarchy {
    return (
        x?.url !== undefined &&
        Array.isArray(x?.concepts) &&
        x?.concepts.every((concept: any) => isConceptHierarchyConcept(concept))
    );
}

function isConceptHierarchyConcept(x: any | undefined): x is ConceptHierarchyConcept {
    return (
        x?.code !== undefined &&
        Array.isArray(x?.descendants) &&
        x?.descendants.every((concept: any) => isConceptHierarchyConcept(concept))
    );
}

// TODO: write unit tests for this stuff...
export function findConcept(hierarchy: ConceptHierarchy, code: string): ConceptHierarchyConcept | undefined {
    function findCodeIn(concept: ConceptHierarchyConcept): ConceptHierarchyConcept | undefined {
        if (concept.code === code) return concept;
        for (const child of concept.descendants) {
            if (child.code === code) return child;
            const result = findCodeIn(child);
            if (result) return result;
        }
        return undefined;
    }
    function findCodeAmong(concepts: ConceptHierarchyConcept[]): ConceptHierarchyConcept | undefined {
        for (const concept of concepts) {
            const result = findCodeIn(concept);
            if (result) return result;
        }
    }
    return findCodeAmong(hierarchy.concepts);
}

// TODO: write unit tests for this stuff...
export function hierarchicalDescendantsOf(hierarchy: ConceptHierarchy, code: string): string[] {
    function collectCodesUnder(concept: ConceptHierarchyConcept): string[] {
        return [concept.code, ...concept.descendants.flatMap(collectCodesUnder)];
    }
    const concept = findConcept(hierarchy, code);
    return concept?.descendants?.flatMap(collectCodesUnder) ?? [];
}

// TODO: write unit tests for this stuff...
export function hierarchicalAncestorsOf(hierarchy: ConceptHierarchy, code: string): string[] {
    function collectPathBetween(root: ConceptHierarchyConcept, code: string): string[] {
        for (const child of root.descendants) {
            if (child.code === code) {
                return [root.code];
            }
            const path = collectPathBetween(child, code);
            if (path.length > 0) {
                return [root.code, ...path];
            }
        }
        return [];
    }
    const concept = findConcept(hierarchy, code);
    if (!concept) return [];

    for (const root of hierarchy.concepts) {
        if (root.code === code) {
            // The code is at the very top-level of the hierarchy, so there are no ancestors.
            return [];
        }
        const path = collectPathBetween(root, code);
        if (path.length > 0) {
            return path;
        }
    }
    return [];
}
