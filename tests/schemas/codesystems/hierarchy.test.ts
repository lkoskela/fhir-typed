import { ConceptHierarchy, ConceptHierarchyConcept, findConcept } from "@src/schemas/codesystems/hierarchy.js";

// TODO: write unit tests for this stuff...
// export function findConcept(hierarchy: ConceptHierarchy, code: string): ConceptHierarchyConcept | undefined;
// export function hierarchicalDescendantsOf(hierarchy: ConceptHierarchy, code: string): string[];
// export function hierarchicalAncestorsOf(hierarchy: ConceptHierarchy, code: string): string[];

describe("findConcept", () => {
    const hierarchy: ConceptHierarchy = {
        url: "http://example.org/fhir/CodeSystem/resources-codesystem",
        concepts: [
            {
                code: "root",
                properties: {},
                descendants: [
                    {
                        code: "child",
                        properties: {},
                        descendants: [
                            {
                                code: "grandchild",
                                properties: {},
                                descendants: [],
                            },
                        ],
                    },
                ],
            },
        ],
    };

    it("should find a top-level concept in a hierarchy", () => {
        expect(findConcept(hierarchy, "root")).toBeDefined();
        expect(findConcept(hierarchy, "root")).toHaveProperty("code", "root");
    });

    it("should find a child concept in a hierarchy", () => {
        expect(findConcept(hierarchy, "child")).toBeDefined();
        expect(findConcept(hierarchy, "child")).toHaveProperty("code", "child");
    });

    it("should find a grandchild concept in a hierarchy", () => {
        expect(findConcept(hierarchy, "grandchild")).toBeDefined();
        expect(findConcept(hierarchy, "grandchild")).toHaveProperty("code", "grandchild");
    });

    it("should return undefined if a concept is not found in a hierarchy", () => {
        expect(findConcept(hierarchy, "non-existent")).toBeUndefined();
    });
});
