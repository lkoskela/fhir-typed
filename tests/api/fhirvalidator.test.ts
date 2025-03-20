import { globSync } from "glob";

import "@tests/matchers/index.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { FhirValidator, ValidationResult } from "@src/api/fhir-validator.js";

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
    validator: FhirValidator,
    schemaName: string,
    data: any
): Promise<ValidationResult> {
    const recognizesType = await validator.recognizes(schemaName);
    if (!recognizesType) {
        return {
            success: false,
            errors: [`Did not recognize type ${JSON.stringify(schemaName)}`],
        } satisfies ValidationResult;
    }
    return await validator.validate(data, { profiles: [schemaName] });
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
    validator: FhirValidator,
    nameOrUrl: string,
    validCases: TestCase | Array<TestCase>,
    invalidCases: TestCase | Array<TestCase>
) {
    const validate = (input: any): Promise<ValidationResult> => {
        return validateAgainstSchema(validator, nameOrUrl, input);
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
    let validator = new FhirValidator();
    validator.loadPackages(...packages);

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
        generateTestsForSchema(validator, schema, validCases, invalidCases);
    });
}

describe("FhirValidator (examples in code)", () => {
    describe("without prior load requests", () => {
        let v = new FhirValidator();

        beforeEach(() => {
            // Reset the validator between tests
            v = new FhirValidator();
        });

        describe("does not recognize non-trivial R4 profiles, data types, or value sets", async () => {
            it("resources", async () => {
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(false);
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Appointment")).resolves.toBe(false);
            });
            it("value sets", async () => {
                await expect(v.recognizes("http://hl7.org/fhir/ValueSet/name-use")).resolves.toBe(false);
            });
        });

        describe("does recognize certain built-in value sets", async () => {
            it("complex types", async () => {
                await expect(v.recognizes("Meta")).resolves.toBe(true);
                await expect(v.recognizes("Quantity")).resolves.toBe(true);
            });

            it("simple types", async () => {
                await expect(v.recognizes("uri")).resolves.toBe(true);
                await expect(v.recognizes("canonical")).resolves.toBe(true);
                await expect(v.recognizes("dateTime")).resolves.toBe(true);
            });

            it("https://www.iana.org/time-zones", async () => {
                await expect(v.recognizes("https://www.iana.org/time-zones")).resolves.toBe(true);
            });

            it("urn:ietf:bcp:13", async () => {
                await expect(v.recognizes("urn:ietf:bcp:13")).resolves.toBe(true);
            });
        });

        describe("does validate certain built-in value sets", async () => {
            describe("https://www.iana.org/time-zones", async () => {
                const validation = (input: any) => v.validate(input, { profiles: ["https://www.iana.org/time-zones"] });

                it("valid inputs", async () => {
                    await expect(validation("Europe/Helsinki")).resolves.toMatchObject({ success: true });
                    await expect(validation("America/New York")).resolves.toMatchObject({ success: true });
                    await expect(validation("Asia/Tokyo")).resolves.toMatchObject({ success: true });
                    await expect(validation("GMT")).resolves.toMatchObject({ success: true });
                    await expect(validation("America/NoSuchCity")).resolves.toMatchObject({ success: true });
                });

                it("invalid inputs", async () => {
                    await expect(validation("NoSuchContinent/Berlin")).resolves.toMatchObject({ success: false });
                    await expect(validation("")).resolves.toMatchObject({ success: false });
                    await expect(validation("NoSuchTimezone")).resolves.toMatchObject({ success: false });
                });
            });
        });

        describe("loads profiles as requested", async () => {
            beforeEach(() => {
                // Reset the validator between tests
                v = new FhirValidator();
            });

            it("loads profiles from a package", async () => {
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(false);
                await v.loadPackages("hl7.fhir.r4.core!4.0.1");
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(true);
            });

            it("the version number of a requested package can be omitted", async () => {
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(false);
                await v.loadPackages("hl7.fhir.r4.core");
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(true);
            });

            it("the version number of a requested package can be 'latest'", async () => {
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(false);
                await v.loadPackages("hl7.fhir.r4.core!latest");
                await expect(v.recognizes("http://hl7.org/fhir/StructureDefinition/Patient")).resolves.toBe(true);
            });

            it("loads profiles transitively from dependencies of the requested package", async () => {
                const profiles = [
                    "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient",
                    "http://hl7.org/fhir/uv/ipa/StructureDefinition/ipa-patient",
                    "http://hl7.org/fhir/StructureDefinition/Patient",
                ];
                for (const profile of profiles) {
                    const msg = `before loading package, ${profile} should not be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(false);
                }
                await v.loadPackages("hl7.fhir.fi.base!1.0.0");
                for (const profile of profiles) {
                    const msg = `after loading package, ${profile} should be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(true);
                }
            });

            it("can load profiles multiple times along the way", async () => {
                const FIBASE = "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient";
                const IPA = "http://hl7.org/fhir/uv/ipa/StructureDefinition/ipa-patient";
                const R4 = "http://hl7.org/fhir/StructureDefinition/Patient";

                for (const profile of [R4, IPA, FIBASE]) {
                    const msg = `before loading any packages, ${profile} should not be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(false);
                }

                // Load the R4 package (R4 should be recognized, IPA and FIBASE should not)
                await v.loadPackages("hl7.fhir.r4.core!4.0.1");
                for (const profile of [R4]) {
                    const msg = `after loading the package, ${profile} should be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(true);
                }
                for (const profile of [IPA, FIBASE]) {
                    const msg = `before loading the package, ${profile} should not be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(false);
                }
                // Load the IPA package (R4 and IPA should be recognized, FIBASE should not)
                await v.loadPackages("hl7.fhir.uv.ipa!1.0.0");
                for (const profile of [R4, IPA]) {
                    const msg = `after loading the package, ${profile} should be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(true);
                }
                for (const profile of [FIBASE]) {
                    const msg = `before loading the package, ${profile} should not be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(false);
                }
                // Load the FIBASE package (R4, IPA, and FIBASE should all be recognized)
                await v.loadPackages("hl7.fhir.fi.base!1.0.0");
                for (const profile of [R4, IPA, FIBASE]) {
                    const msg = `after loading the package, ${profile} should be recognized`;
                    await expect(v.recognizes(profile), msg).resolves.toBe(true);
                }
            });
        });
    });

    describe("validates simple types", () => {
        const v = new FhirValidator();

        beforeAll(async () => {
            await v.loadPackages("hl7.fhir.r4.core!4.0.1");
        });

        describe("uri", () => {
            const typeName = "uri";
            const validation = (input: any) => v.validate(input, { profiles: [typeName] });

            it("recognizes the type", async () => {
                await expect(v.recognizes(typeName)).resolves.toBe(true);
            });

            it("passes valid inputs", async () => {
                await expect(validation("http://foo.bar/xyz")).resolves.toMatchObject({ success: true });
                await expect(validation("urn:oid:1.2.3.4")).resolves.toMatchObject({ success: true });
            });

            it("fails invalid inputs", async () => {
                await expect(validation("14235234524")).resolves.toMatchObject({ success: false });
            });
        });

        describe("dateTime", () => {
            const typeName = "dateTime";
            const validation = (input: any) => v.validate(input, { profiles: [typeName] });

            it("recognizes the type", async () => {
                await expect(v.recognizes(typeName)).resolves.toBe(true);
            });

            it("passes valid inputs", async () => {
                await expect(validation("2021-01-01T00:00:00Z")).resolves.toMatchObject({ success: true });
                await expect(validation("2021-01-01T00:00:00")).resolves.toMatchObject({ success: true });
            });

            it("fails invalid inputs", async () => {
                await expect(validation("14235234524")).resolves.toMatchObject({ success: false });
            });
        });

        describe("boolean", () => {
            const typeName = "boolean";
            const validation = (input: any) => v.validate(input, { profiles: [typeName] });

            it("recognizes the type", async () => {
                await expect(v.recognizes(typeName)).resolves.toBe(true);
            });

            it("passes valid inputs", async () => {
                await expect(validation("true")).resolves.toMatchObject({ success: true });
                await expect(validation(true)).resolves.toMatchObject({ success: true });
                await expect(validation("false")).resolves.toMatchObject({ success: true });
                await expect(validation(false)).resolves.toMatchObject({ success: true });
            });

            it("fails invalid inputs", async () => {
                await expect(validation("12345")).resolves.toMatchObject({ success: false });
                await expect(validation(12345)).resolves.toMatchObject({ success: false });
            });
        });
    });

    describe("validates complex types", () => {
        const v = new FhirValidator();

        beforeAll(async () => {
            await v.loadPackages("hl7.fhir.r4.core!4.0.1");
        });

        describe("Identifier", () => {
            const typeName = "Identifier";
            const validation = async (input: any) => v.validate(input, { profiles: [typeName] });

            it("recognizes the type", async () => {
                await expect(v.recognizes(typeName)).resolves.toBe(true);
            });

            it("passes valid inputs", async () => {
                await expect(
                    validation({
                        use: "official",
                        system: "urn:oid:2.16.840.1.113883.214",
                        value: "Whatever",
                    }),
                    `"official" identifier`
                ).resolves.toMatchObject({ success: true });

                await expect(
                    validation({
                        use: "usual",
                        system: "urn:oid:2.16.840.1.113883.214",
                        value: "Whatever",
                    }),
                    `"usual" identifier`
                ).resolves.toMatchObject({ success: true });
            });

            it("fails invalid inputs", async () => {
                await expect(
                    validation({
                        use: "wrongvaluehere",
                        system: "urn:oid:2.16.840.1.113883.214",
                        value: "Whatever",
                    }),
                    `Incorrect value for "use" field`
                ).resolves.toMatchObject({ success: false });
                await expect(validation("12345")).resolves.toMatchObject({ success: false });
                await expect(validation(12345)).resolves.toMatchObject({ success: false });
            });
        });
    });
});

describe("FhirValidator (examples in data/resources/)", () => {
    /**
     * R4 Patient profiles.
     */
    describe("for R4 profiles", () => {
        const packages = ["hl7.fhir.r4.core!4.0.1"];
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
