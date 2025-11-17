import { ResourceFile } from "@src/schemas/types/index.js";
import { CACHE_DIR } from "@src/packages/resource-loader.js";
import { sortResourceFilesByKind, sortResourceFilesByDependencies } from "@src/utils/sorting.js";
import { stubResourceFile, stubValueSet } from "./fixtures.js";
import { join } from "path";
import { homedir } from "os";

function generatePermutations<T>(array: Array<T>): Array<Array<T>> {
    if (array.length === 0) {
        return [[]];
    }
    const result: Array<Array<T>> = [];
    function permute(arr: Array<T>, m: Array<T> = []) {
        if (arr.length === 0) {
            result.push(m);
        } else {
            for (let i = 0; i < arr.length; i++) {
                const newArr = arr.slice(0, i).concat(arr.slice(i + 1));
                permute(newArr, m.concat(arr[i]));
            }
        }
    }
    permute([...array]);
    return result;
}

describe("precedence", () => {
    describe("sortResourceFilesByKind", () => {
        describe("resources of same kind", () => {
            it("are sorted in alphabetical order by name", () => {
                const a = stubResourceFile({ name: "Apples" });
                const b = stubResourceFile({ name: "Bananas" });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });

            it("are sorted in alphabetical order by url if names match", () => {
                const a = stubResourceFile({
                    name: "same",
                    url: "https://acme.com/apples",
                });
                const b = stubResourceFile({
                    name: "same",
                    url: "https://acme.com/bananas",
                });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });
        });

        describe("resources of different kind", () => {
            it("primitive types come before complex types", () => {
                const a = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "primitive",
                });
                const b = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "complex-type",
                });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });

            it("complex types come before resources", () => {
                const a = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "complex-type",
                });
                const b = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "resource",
                });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });

            it("code systems come before resources", () => {
                const a = stubResourceFile({ resourceType: "CodeSystem" });
                const b = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "resource",
                });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });

            it("code systems come before value sets", () => {
                const a = stubResourceFile({ resourceType: "CodeSystem" });
                const b = stubResourceFile({ resourceType: "ValueSet" });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });

            it("value sets come before resources", () => {
                const a = stubResourceFile({ resourceType: "ValueSet" });
                const b = stubResourceFile({
                    resourceType: "StructureDefinition",
                    kind: "resource",
                });
                expect([a, b].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
                expect([b, a].sort(sortResourceFilesByKind)).toStrictEqual([a, b]);
            });
        });
    });
});

describe("precedence", () => {
    describe("smoke test", () => {
        const cs = stubResourceFile({
            url: "http://terminology.hl7.org/CodeSystem/practitioner-role",
            filePath: join(CACHE_DIR, "packages/hl7.fhir.r4.core#4.0.1/package/CodeSystem-practitioner-role.json"),
        });
        const vs = stubResourceFile({
            url: "http://hl7.org/fhir/ValueSet/practitioner-role",
            filePath: join(CACHE_DIR, "packages/hl7.fhir.r4.core#4.0.1/package/ValueSet-practitioner-role.json"),
        });
        const sortFn = sortResourceFilesByDependencies([cs, vs]);

        it("CodeSystem comes before ValueSet", () => {
            const expected = [cs, vs];
            const expectedNames = expected.map((x) => x.name);
            expect(expected.sort(sortFn).map((x) => x.name)).toStrictEqual(expectedNames);
            expect(
                expected
                    .reverse()
                    .sort(sortFn)
                    .map((x) => x.name)
            ).toStrictEqual(expectedNames);
        });
    });

    describe("sortResourceFilesByDependencies", () => {
        const MEATS_URL = "https://acme.com/ValueSet/meats";
        const FRUITS_URL = "https://acme.com/ValueSet/fruits";
        const PROTEINS_URL = "https://acme.com/ValueSet/proteins";
        const FOODS_URL = "https://acme.com/ValueSet/foods";
        const VEGGIES_URL = "https://acme.com/ValueSet/veggies";
        const VEGGIE_PROTEINS_URL = "https://acme.com/system/vegetarian-proteins";

        const meatsValueSet = stubValueSet({
            name: "Meats",
            url: MEATS_URL,
        });
        const fruitsValueSet = stubValueSet({
            name: "Fruits",
            url: FRUITS_URL,
        });

        const proteinsValueSet = stubValueSet({
            name: "Proteins",
            url: PROTEINS_URL,
            compose: {
                include: [
                    {
                        valueSet: [MEATS_URL],
                    },
                    {
                        system: VEGGIE_PROTEINS_URL,
                    },
                ],
            },
        });

        const foodsValueSet = stubValueSet({
            name: "Foods",
            url: FOODS_URL,
            compose: {
                include: [
                    {
                        valueSet: [FRUITS_URL, VEGGIES_URL],
                    },
                    {
                        valueSet: [PROTEINS_URL],
                    },
                ],
            },
        });

        const fruitsFile = stubResourceFile(undefined, fruitsValueSet);
        const foodsFile = stubResourceFile(undefined, foodsValueSet);
        const meatsFile = stubResourceFile(undefined, meatsValueSet);
        const proteinsFile = stubResourceFile(undefined, proteinsValueSet);

        const sortFn = sortResourceFilesByDependencies([fruitsFile, foodsFile, proteinsFile, meatsFile]);

        const printable = (list: ResourceFile[]): string => list.map((x) => x.name).join(", ");

        const generateTestsForCombination = (...expected: ResourceFile[]): void => {
            const expectedNames = expected.map((x) => x.name);
            generatePermutations(expected).forEach((input) => {
                it(`${printable(input)} => ${printable(expected)}`, () => {
                    const actualNames = input.sort(sortFn).map((x) => x.name);
                    expect(actualNames).toStrictEqual(expectedNames);
                });
            });
        };

        describe("2-way sorting", () => {
            generateTestsForCombination(fruitsFile, foodsFile);
            generateTestsForCombination(meatsFile, foodsFile);
            generateTestsForCombination(meatsFile, proteinsFile);
            generateTestsForCombination(proteinsFile, foodsFile);
            generateTestsForCombination(proteinsFile, foodsFile);
        });

        describe("3-way sorting", () => {
            generateTestsForCombination(meatsFile, proteinsFile, foodsFile);
            generateTestsForCombination(fruitsFile, proteinsFile, foodsFile);
            generateTestsForCombination(fruitsFile, meatsFile, foodsFile);
            generateTestsForCombination(fruitsFile, meatsFile, proteinsFile);
        });

        describe("4-way sorting", () => {
            generateTestsForCombination(fruitsFile, meatsFile, proteinsFile, foodsFile);
        });

        describe("real examples", () => {
            const fiPatient = {
                filePath: join(
                    homedir(),
                    ".fhir/packages/hl7.fhir.fi.base#1.0.0/package/StructureDefinition-fi-base-patient.json"
                ),
                resourceType: "StructureDefinition",
                url: "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient",
                name: "fi-base-patient",
                kind: "resource",
            } satisfies ResourceFile;
            const ipaPatient = {
                filePath: join(
                    homedir(),
                    ".fhir/packages/hl7.fhir.uv.ipa#1.0.0/package/StructureDefinition-ipa-patient.json"
                ),
                resourceType: "StructureDefinition",
                url: "http://hl7.org/fhir/uv/ipa/StructureDefinition/ipa-patient",
                name: "ipa-patient",
                kind: "resource",
            } satisfies ResourceFile;

            it("sorts ipa-patient before fi-base-patient", () => {
                const fn = sortResourceFilesByDependencies([fiPatient, ipaPatient]);
                const input = [fiPatient, ipaPatient];
                const expected = [ipaPatient, fiPatient];
                const sorted = input.sort(fn);
                expect(sorted).toStrictEqual(expected);
            });

            it("sorts ipa-patient before fi-base-patient (input in reverse order)", () => {
                const fn = sortResourceFilesByDependencies([fiPatient, ipaPatient]);
                const input = [ipaPatient, fiPatient];
                const expected = [ipaPatient, fiPatient];
                const sorted = input.sort(fn);
                expect(sorted).toStrictEqual(expected);
            });

            it("sorts ipa-patient before fi-base-patient (seed in reverse order)", () => {
                const fn = sortResourceFilesByDependencies([ipaPatient, fiPatient]);
                const input = [fiPatient, ipaPatient];
                const expected = [ipaPatient, fiPatient];
                const sorted = input.sort(fn);
                expect(sorted).toStrictEqual(expected);
            });

            it("sorts ipa-patient before fi-base-patient (seed and input in reverse order)", () => {
                const fn = sortResourceFilesByDependencies([ipaPatient, fiPatient]);
                const input = [ipaPatient, fiPatient];
                const expected = [ipaPatient, fiPatient];
                const sorted = input.sort(fn);
                expect(sorted).toStrictEqual(expected);
            });
        });
    });
});
