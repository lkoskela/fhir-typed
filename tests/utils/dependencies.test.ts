import { extractDependenciesFromResource, ResourceObject } from "@src/schemas/utils/dependencies.js";
import { stubStructureDefinition, stubValueSet, urlForResource } from "./fixtures.js";

describe("extractDependenciesFromResource", () => {
    /**
     * StructureDefinition
     */
    describe("StructureDefinition", () => {
        describe("with no dependencies", () => {
            it("resolved no dependencies", () => {
                expect(extractDependenciesFromResource(stubStructureDefinition())).toStrictEqual([]);
            });
        });
        describe("with some dependencies", () => {
            const elementTypeCodeUri = "https://some/FHIR/element-type-code";
            const profileUrl = "https://some/FHIR/profile-url";

            const resource = stubStructureDefinition({
                snapshot: {
                    element: [
                        {
                            type: [
                                {
                                    code: elementTypeCodeUri,
                                    profile: [profileUrl],
                                },
                            ],
                        },
                    ],
                },
            });

            it("resolved no dependencies", () => {
                expect(extractDependenciesFromResource(resource)).toStrictEqual([elementTypeCodeUri, profileUrl]);
            });
        });
    });

    /**
     * ValueSet
     */
    describe("ValueSet", () => {
        describe("with no dependencies", () => {
            it("resolved no dependencies", () => {
                expect(extractDependenciesFromResource(stubValueSet())).toStrictEqual([]);
            });
        });

        describe("that includes another ValueSet", () => {
            const canonical = urlForResource("ValueSet", "SomeOtherValueSet");
            const valueset = stubValueSet({
                compose: {
                    include: [
                        {
                            valueSet: [canonical],
                        },
                    ],
                },
            });

            it("yields the URL of that other ValueSet", () => {
                expect(extractDependenciesFromResource(valueset)).toStrictEqual([canonical]);
            });
        });

        describe("that includes or excludes a system", () => {
            const includedSystem = "http://snomed.info/sct";
            const excludedSystem = "http://snomed.info/sct";

            const valueset = stubValueSet({
                compose: {
                    include: [
                        {
                            system: includedSystem,
                        },
                    ],
                    exclude: [
                        {
                            system: excludedSystem,
                        },
                    ],
                },
            });

            it("yields the URL of that system", () => {
                expect(extractDependenciesFromResource(valueset)).toStrictEqual([includedSystem]);
            });
        });
    });
});
