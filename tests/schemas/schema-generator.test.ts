import { z } from "zod";
import { globSync } from "glob";

import "@tests/__helpers/matchers/index.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { generateZodSchemasForPackages } from "@src/schemas/schema-generator.js";

function listFiles(pattern: string): string[] {
    return globSync(pattern);
}

type TestCase = {
    description?: string;
    data: any;
};

function run(testcases: TestCase | Array<TestCase>, callback: (data: any) => Promise<any>): void {
    if (!Array.isArray(testcases)) {
        testcases = [testcases];
    }
    for (const testcase of testcases) {
        it(`${testcase.description || JSON.stringify(testcase.data)}`, async () => {
            await callback(testcase.data);
        });
    }
}

async function validateAgainstSchema(
    schemas: Record<string, z.Schema>,
    schemaName: string,
    data: any
): Promise<z.SafeParseReturnType<any, any>> {
    const schema = schemas[schemaName];
    if (!schema) {
        console.error(`Schema '${schemaName}' not found`);
        const issue: z.ZodIssue = {
            message: `Could not find schema ${JSON.stringify(schemaName)}`,
            code: z.ZodIssueCode.custom,
            path: [],
        };
        return { success: false, error: new z.ZodError([issue]) } as z.SafeParseReturnType<any, any>;
    }
    const result = await schema.safeParseAsync(data);
    (result as any).schemaSource = (schemaName as any).__source;
    return result;
}

// function extractIssuesFromResult(result: z.SafeParseReturnType<any, any>): string[] {
//     const stringifyIssue = (issue: z.ZodIssue) => {
//         const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
//         return `${path}: ${issue.message} (${issue.code})`;
//     };
//     const issues = result.error?.issues || [];
//     return issues.map(stringifyIssue);
// }

function generateTestsForSchema(
    schemas: () => Record<string, z.Schema>,
    nameOrUrl: string,
    validCases: TestCase | Array<TestCase>,
    invalidCases: TestCase | Array<TestCase>
) {
    const validate = (input: any): Promise<z.SafeParseReturnType<any, any>> => {
        return validateAgainstSchema(schemas(), nameOrUrl, input);
    };

    const numberOfValidCases = [validCases].flat().length;
    if (numberOfValidCases > 0) {
        const plural = numberOfValidCases === 1 ? "" : "s";
        describe(`${numberOfValidCases} valid example${plural}`, () => {
            run(validCases, async (data) => {
                const result = await validate(data);
                expect(result).toPass();
            });
        });
    }
    const numberOfInvalidCases = [invalidCases].flat().length;
    if (numberOfInvalidCases > 0) {
        const plural = numberOfInvalidCases === 1 ? "" : "s";
        describe(`${numberOfInvalidCases} invalid example${plural}`, () => {
            run(invalidCases, async (data) => {
                const result = await validate(data);
                expect(result).toFail();
            });
        });
    }
}

/**
 * Callback function for providing one or more examples to test validation with.
 */
type ProvideExampleFn = (...examples: TestCase[]) => void;

/**
 * Generate a set of validation tests for a given schema.
 *
 * @param packages A list of FHIR (NPM) package names required to validate the schema.
 * @param schema The name or URL of the schema to validate (e.g. "HumanName" or "http://hl7.org/fhir/StructureDefinition/Patient").
 * @param callback Block for providing valid and invalid examples.
 */
function describeSchema(
    packages: string[],
    schema: string,
    callback: (valid: ProvideExampleFn, invalid: ProvideExampleFn) => Promise<void> | void
) {
    let schemas: Record<string, z.Schema>;
    beforeAll(async () => {
        schemas = await generateZodSchemasForPackages(...packages);
    });

    describe(schema, async () => {
        const validCases: TestCase[] = [];
        const invalidCases: TestCase[] = [];
        const provideValid: ProvideExampleFn = (...examples) => {
            validCases.push(...examples);
        };
        const provideInvalid: ProvideExampleFn = (...examples) => {
            invalidCases.push(...examples);
        };
        await Promise.resolve(callback(provideValid, provideInvalid));
        generateTestsForSchema(() => schemas, schema, validCases, invalidCases);
    });
}

describe("Zod schema generation", () => {
    /**
     * Standard FHIR R4 Core profiles.
     */
    describe("for standard R4 profiles", () => {
        const packages = ["hl7.fhir.r4.core!4.0.1"];
        let schemas: Record<string, z.Schema>;

        beforeAll(async () => {
            schemas = await generateZodSchemasForPackages("hl7.fhir.r4.core!4.0.1");
        });

        describeSchema(packages, "https://www.iana.org/time-zones", (valid, invalid) => {
            valid(
                { data: "Europe/Helsinki" },
                { data: "America/New York" },
                { data: "Asia/Tokyo" },
                { data: "GMT" },
                { data: "America/NoSuchCity", description: "Existing continent with a non-existent city" }
            );
            invalid(
                { data: "NoSuchContinent/Berlin" },
                { data: "", description: "(empty string)" },
                { data: "NoSuchTimezone" }
            );
        });

        describeSchema(packages, "HumanName", (valid, invalid) => {
            valid({
                description: "Pieter van de Heuvel",
                data: {
                    use: "usual",
                    family: "van de Heuvel",
                    given: ["Pieter"],
                    suffix: ["MSc"],
                },
            });
            valid({
                // R4 doesn't require any identifying fields to be present in a HumanName... (roll eyes emoji)
                description: "Object with only 'use' field",
                data: {
                    use: "usual",
                },
            });
            invalid(
                {
                    description: 'Incorrect "use" field',
                    data: {
                        use: "WrONg",
                        family: "van de Heuvel",
                        given: ["Pieter"],
                        suffix: ["MSc"],
                    },
                },
                {
                    description: "Empty object",
                    data: {},
                }
            );
        });

        describeSchema(packages, "Identifier", (valid, invalid) => {
            valid({
                description: '"official" identifier',
                data: {
                    use: "official",
                    system: "urn:oid:2.16.840.1.113883.214",
                    value: "Whatever",
                },
            });
            valid({
                description: '"usual" identifier',
                data: {
                    use: "usual",
                    system: "urn:oid:2.16.840.1.113883",
                    value: "Whatever",
                },
            });
            invalid({
                description: 'Incorrect "use" field',
                data: {
                    use: "unknownuse",
                    system: "urn:oid:2.16.840.1.113883.214",
                    value: "Whatever",
                },
            });
        });

        /**
         * R4 Patient profile.
         */
        describeSchema(packages, "http://hl7.org/fhir/StructureDefinition/Patient", (valid, invalid) => {
            const validPatient = {
                resourceType: "Patient",
                active: true,
                deceasedBoolean: false,
                identifier: [
                    {
                        use: "usual",
                        system: "urn:oid:2.16.840.1.113883.2.4.6.3",
                        value: "738472983",
                    },
                ],
                name: [
                    {
                        use: "usual",
                        family: "van de Heuvel",
                        given: ["Pieter"],
                        suffix: ["MSc"],
                        text: "Pieter van de Heuvel",
                    },
                ],
            };

            valid({
                description: "Valid R4 patient",
                data: validPatient,
            });
            valid({
                description: "Valid R4 patient (with missing identifier.value)",
                data: { ...validPatient, identifier: [{ ...validPatient.identifier[0], value: undefined }] },
            });
            valid({
                description: "Valid R4 patient (with empty identifier array)",
                data: { ...validPatient, identifier: [] },
            });
            valid({
                description: "Valid R4 patient (with no identifier array)",
                data: { ...validPatient, identifier: undefined },
            });

            /**
             * choice-of-type fields like "deceased[x]" or "multipleBirth[x]" must have exactly one value.
             */
            invalid({
                description: "Patient with two deceased[x] fields",
                data: { ...validPatient, deceasedBoolean: true, deceasedDateTime: "2021-01-01T00:00:00Z" },
            });
            invalid({
                description: "Patient with two multipleBirth[x] fields",
                data: { ...validPatient, multipleBirthInteger: 2, multipleBirthBoolean: true },
            });
        });
    });

    /**
     * International Patient Access (IPA) profiles.
     */
    describe("for IPA profiles", () => {
        const packages = ["hl7.fhir.uv.ipa!1.0.0"];

        describeSchema(packages, "http://hl7.org/fhir/uv/ipa/StructureDefinition/ipa-patient", (valid, invalid) => {
            const validIpaPatient = {
                resourceType: "Patient",
                identifier: [
                    {
                        use: "usual",
                        system: "urn:oid:2.16.840.1.113883.2.4.6.3",
                        value: "738472983",
                    },
                ],
                active: true,
                name: [
                    {
                        use: "usual",
                        family: "van de Heuvel",
                        given: ["Pieter"],
                        suffix: ["MSc"],
                    },
                ],
                link: [
                    {
                        type: "seealso",
                        other: {
                            reference: "Patient/123",
                        },
                    },
                ],
            };

            valid({
                description: "Valid patient",
                data: validIpaPatient,
            });

            // IPA Patient must have a "value" field in its "identifier" field as the
            // profile overrides the looser cardinality in the base Patient profile:
            invalid({
                description: "Patient",
                data: { ...validIpaPatient, identifier: [{ ...validIpaPatient.identifier[0], value: undefined }] },
            });
            // IPA patient that doesn't have an "identifier" field should fail validation:
            invalid(
                {
                    description: "Patient without an identifier (field is undefined)",
                    data: { ...validIpaPatient, identifier: undefined },
                },
                {
                    description: "Patient without an identifier (field is an empty array)",
                    data: { ...validIpaPatient, identifier: [] },
                }
            );
        });
    });

    /**
     * Finnish Base profiles.
     */
    describe("for Finnish Base profiles", () => {
        describeSchema(
            ["hl7.fhir.r4.core!4.0.1", "hl7.fhir.fi.base!1.0.0"],
            "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient",
            (valid, invalid) => {
                const file = (filePath: string, callback: ProvideExampleFn) => {
                    callback({
                        description: filePath,
                        data: parseJsonFromFilePath(filePath),
                    });
                };
                const validFile = (f: string) => file(f, valid);
                const invalidFile = (f: string) => file(f, invalid);
                listFiles("data/resources/hl7.fhir.fi.base/**/Patient-*.valid.json").forEach(validFile);
                listFiles("data/resources/hl7.fhir.fi.base/**/Patient-*.invalid.json").forEach(invalidFile);
            }
        );
    });
});
