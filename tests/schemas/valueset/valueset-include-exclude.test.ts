import { z, ZodSchema } from "zod";
import { ResourceFile } from "@src/schemas/types/index.js";
import {
    valueSet,
    GreekAlphabetCodeSystem,
    resourceFile,
    concepts,
    FinnishAlphabetValueSet,
    EnglishAlphabetCodeSystem,
    GreekAlphabetValueSet,
    FinnishAlphabetCodeSystem,
    EnglishAlphabetValueSet,
    processResources,
    ShortGreekAlphabetCodeSystem,
    LongGreekAlphabetCodeSystem,
} from "@tests/__helpers/fixtures/index.js";
import { ValueSet } from "@src/generated/FHIR-r4.js";

const AllButSixLetterGreekAlphabetValueSet = {
    resourceType: "ValueSet",
    id: "all-but-six-letter-greek-alphabet",
    url: "http://example.org/fhir/ValueSet/all-but-six-letter-greek-alphabet",
    version: "1.0.0",
    name: "AllButSixLetterGreekAlphabetValueSet",
    status: "active",
    compose: {
        include: [
            {
                system: GreekAlphabetCodeSystem.url,
            },
        ],
        exclude: [
            {
                system: GreekAlphabetCodeSystem.url,
                concept: [
                    {
                        code: "lambda",
                    },
                ],
            },
        ],
    },
} satisfies ValueSet;

const EnglishVowelsValueSet = valueSet("EnglishVowels", "aeiouy".split(""));

/**
 * A ValueSet can include a CodeSystem as-is.
 */
describe("ValueSet including a CodeSystem without excludes", () => {
    const codesystemFile: ResourceFile = resourceFile(GreekAlphabetCodeSystem);
    const valuesetFile: ResourceFile = resourceFile(GreekAlphabetValueSet);
    const schemas: Record<string, ZodSchema> = {};
    const resources: Record<string, any> = {};

    const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
        schemas[rf.url] = schema;
        resources[rf.url] = resource;
    };
    const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
    const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];

    beforeAll(async () => {
        await processResources(
            contribute,
            resolveSchema,
            resolveResource,
            valuesetFile,
            codesystemFile,
            resourceFile(AllButSixLetterGreekAlphabetValueSet),
            resourceFile(GreekAlphabetCodeSystem)
        );
    });

    describe("the included code system", () => {
        let schema: ZodSchema = z.never();

        beforeAll(async () => {
            schema = schemas[codesystemFile.url];
        });

        it("accepts all its concepts", () => {
            const codes = GreekAlphabetCodeSystem.concept!.map((c) => c.code);
            codes.forEach((code) => {
                const msg = `Expected ${code} to be accepted by the ${GreekAlphabetCodeSystem.url}`;
                expect(schema.safeParseAsync(code), msg).toPass();
            });
        });

        it("rejects unknown concepts", async () => {
            await expect(schema.safeParseAsync("nosuchcodehere")).toFail();
        });
    });

    describe("the value set including the code system", () => {
        let schema: ZodSchema = z.never();

        beforeAll(async () => {
            schema = schemas[valuesetFile.url];
        });

        it("contains concepts that were not excluded", async () => {
            await expect(schema.safeParseAsync("alpha")).toPass();
            await expect(schema.safeParseAsync("beta")).toPass();
            await expect(schema.safeParseAsync("gamma")).toPass();
            await expect(schema.safeParseAsync("delta")).toPass();
        });

        it("rejects concepts that were excluded", async () => {
            await expect(schema.safeParseAsync("lambda")).toFail();
        });

        it("rejects concepts that were not in the original code system to start with", async () => {
            await expect(schema.safeParseAsync("nosuchcodehere")).toFail();
        });
    });
});

/**
 * A ValueSet can include multiple CodeSystems.
 */
describe("ValueSet including multiple CodeSystems", () => {
    const valueSet = resourceFile({
        resourceType: "ValueSet",
        id: "short-and-long",
        url: "http://example.org/fhir/ValueSet/short-and-long",
        version: "1.0.0",
        name: "ShortAndLongGreekAlphabetValueSet",
        status: "active",
        compose: {
            include: [
                {
                    system: ShortGreekAlphabetCodeSystem.url,
                },
                {
                    system: LongGreekAlphabetCodeSystem.url,
                },
            ],
        },
    });

    let schema: ZodSchema = z.never();
    const schemas: Record<string, ZodSchema> = {};
    const resources: Record<string, any> = {};

    const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
        schemas[rf.url] = schema;
        resources[rf.url] = resource;
    };
    const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
    const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];

    beforeAll(async () => {
        await processResources(
            contribute,
            resolveSchema,
            resolveResource,
            valueSet,
            resourceFile(AllButSixLetterGreekAlphabetValueSet),
            resourceFile(ShortGreekAlphabetCodeSystem),
            resourceFile(LongGreekAlphabetCodeSystem),
            resourceFile(GreekAlphabetCodeSystem)
        );
        schema = schemas[valueSet.url];
    });

    describe("contains concepts that were included from the first code system", async () => {
        for (const code of ["pi", "rho"]) {
            it(`includes ${code}`, async () => {
                await expect(schema.safeParseAsync(code)).toPass();
            });
        }
    });

    describe("contains concepts that were included from the second code system", async () => {
        for (const code of ["epsilon", "omicron"]) {
            it(`includes ${code}`, async () => {
                await expect(schema.safeParseAsync(code)).toPass();
            });
        }
    });

    describe("rejects concepts that were not included", async () => {
        for (const code of ["alpha", "gamma"]) {
            it(`includes ${code}`, async () => {
                await expect(schema.safeParseAsync(code)).toFail();
            });
        }
    });
});

/**
 * A ValueSet can include and exclude CodeSystems.
 */
describe("ValueSet including and excluding concepts from CodeSystems and ValueSets", () => {
    // Combined value set that includes the Greek alphabet, Finnish alphabet, excludes
    // short and long Greek alphabet, and excludes American alphabet. In other words,
    // it contains only the mid-length Greek alphabet like "alpha" and "gamma", and
    // the Finnish "umlaut" characters "å", "ä", and "ö".
    const combinedValueSet = resourceFile({
        resourceType: "ValueSet",
        id: "mid-length-greek-alphabet",
        url: "http://example.org/fhir/ValueSet/mid-length-greek-alphabet",
        version: "1.0.0",
        name: "MidLengthGreekAlphabetValueSet",
        status: "active",
        compose: {
            include: [
                {
                    system: GreekAlphabetCodeSystem.url,
                },
                {
                    system: FinnishAlphabetValueSet.url,
                },
            ],
            exclude: [
                {
                    system: ShortGreekAlphabetCodeSystem.url,
                },
                {
                    system: LongGreekAlphabetCodeSystem.url,
                },
                {
                    system: EnglishAlphabetCodeSystem.url,
                },
            ],
        },
    });

    let schema: ZodSchema = z.never();
    const schemas: Record<string, ZodSchema> = {};
    const resources: Record<string, any> = {};

    const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
        schemas[rf.url] = schema;
        resources[rf.url] = resource;
    };
    const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
    const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];

    beforeAll(async () => {
        await processResources(
            contribute,
            resolveSchema,
            resolveResource,
            resourceFile(GreekAlphabetCodeSystem),
            resourceFile(GreekAlphabetValueSet),
            resourceFile(ShortGreekAlphabetCodeSystem),
            resourceFile(LongGreekAlphabetCodeSystem),
            resourceFile(EnglishAlphabetCodeSystem),
            resourceFile(EnglishAlphabetValueSet),
            resourceFile(FinnishAlphabetValueSet),
            resourceFile(FinnishAlphabetCodeSystem),
            combinedValueSet
        );

        schema = schemas[combinedValueSet.url];
    });

    it("does not contain concepts that were excluded", async () => {
        await expect(schema.safeParseAsync("pi")).toFail();
        await expect(schema.safeParseAsync("rho")).toFail();
        await expect(schema.safeParseAsync("epsilon")).toFail();
        await expect(schema.safeParseAsync("omicron")).toFail();
        await expect(schema.safeParseAsync("a")).toFail();
        await expect(schema.safeParseAsync("b")).toFail();
        await expect(schema.safeParseAsync("c")).toFail();
    });

    it("contains concepts that were not excluded", async () => {
        await expect(schema.safeParseAsync("beta")).toPass();
        await expect(schema.safeParseAsync("gamma")).toPass();
        await expect(schema.safeParseAsync("lambda")).toPass();
        await expect(schema.safeParseAsync("å")).toPass();
        await expect(schema.safeParseAsync("ä")).toPass();
        await expect(schema.safeParseAsync("ö")).toPass();
    });
});

/**
 * A ValueSet can include and exclude CodeSystems.
 */
describe("ValueSet including and excluding concepts from CodeSystems and ValueSets", async () => {
    // Combined value set that includes the Greek alphabet, Finnish alphabet, excludes
    // short and long Greek alphabet, and excludes American alphabet. In other words,
    // it contains only the mid-length Greek alphabet like "alpha" and "gamma", and
    // the Finnish "umlaut" characters "å", "ä", and "ö".
    const combinedValueSet = resourceFile({
        resourceType: "ValueSet",
        id: "mid-length-greek-alphabet",
        url: "http://example.org/fhir/ValueSet/mid-length-greek-alphabet",
        version: "1.0.0",
        name: "MidLengthGreekAlphabetValueSet",
        status: "active",
        compose: {
            include: [
                {
                    // Include the first 7 letters of the Greek alphabet.
                    system: GreekAlphabetCodeSystem.url,
                    concept: concepts(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"]),
                },
                {
                    // Include the latter half of the Finnish alphabet.
                    system: FinnishAlphabetValueSet.url,
                    concept: concepts("opqrstuvwxyzåäö".split("")),
                },
                {
                    // Include the entire American alphabet
                    system: EnglishAlphabetCodeSystem.url,
                },
            ],
            exclude: [
                {
                    // Exclude the entire short Greek alphabet (anything shorter than 4 letters).
                    // This should leave "alpha", "beta", "gamma", "delta", "epsilon", and "zeta"
                    // (we've now excluded "eta") plus the entire English and Finnish alphabets.
                    system: ShortGreekAlphabetCodeSystem.url,
                },
                {
                    // Exclude specific longer codes from the Greek alphabet. This should leave us
                    // "alpha", "beta", "gamma", "delta", and "zeta". (we've now excluded "epsilon")
                    // plus the entire English and Finnish alphabets
                    system: GreekAlphabetCodeSystem.url,
                    concept: concepts(["epsilon", "lambda", "omicron", "upsilon"]),
                },
                {
                    // Exclude all vowels in the English alphabet. This should leave us with the
                    // Greek alphabet "alpha", "beta", "gamma", "delta", and "zeta", and, from the
                    // English alphabet, consonants "b", "c", "d", "f", "g", "h", "j", "k", "l", "m",
                    // "n", "p", "q", "r", "s", "t", "v", "w", "x", "z" plus the three Finnish vowels
                    // "å", "ä", and "ö".
                    valueSet: [EnglishVowelsValueSet.url],
                },
            ],
        },
    });

    // That should leave us with:
    // - from the Greek alphabet: alpha, beta, gamma, delta, zeta (eta anđ epsilon were excluded)
    // - From the Finnish alphabet: pqrstvwxzåäö
    // - From the American alphabet: bcdfghjklmn

    let schema: ZodSchema = z.never();
    const schemas: Record<string, ZodSchema> = {};
    const resources: Record<string, any> = {};

    const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
        schemas[rf.url] = schema;
        resources[rf.url] = resource;
    };
    const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
    const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];

    beforeAll(async () => {
        await processResources(
            contribute,
            resolveSchema,
            resolveResource,
            resourceFile(GreekAlphabetCodeSystem),
            resourceFile(GreekAlphabetValueSet),
            resourceFile(ShortGreekAlphabetCodeSystem),
            resourceFile(LongGreekAlphabetCodeSystem),
            resourceFile(EnglishAlphabetCodeSystem),
            resourceFile(EnglishAlphabetValueSet),
            resourceFile(FinnishAlphabetValueSet),
            resourceFile(FinnishAlphabetCodeSystem),
            combinedValueSet
        );

        schema = schemas[combinedValueSet.url];
    });

    it("does not contain concepts that were excluded", async () => {
        await expect(schema.safeParseAsync("epsilon")).toFail();
        await expect(schema.safeParseAsync("eta")).toFail();
        await expect(schema.safeParseAsync("a")).toFail();
    });

    it("does not contain concepts that were not included in the first place", async () => {
        await expect(schema.safeParseAsync("omega")).toFail();
        await expect(schema.safeParseAsync("pi")).toFail();
    });

    it("contains concepts that were included and were not excluded", async () => {
        // Greek alphabet "alpha", "beta", "gamma", "delta", and "zeta", and, from the
        // English alphabet, consonants "b", "c", "d", "f", "g", "h", "j", "k", "l", "m",
        // "n", "p", "q", "r", "s", "t", "v", "w", "x", "z" plus the three Finnish vowels
        // "å", "ä", and "ö".

        for (const code of ["alpha", "beta", "gamma", "delta", "zeta"]) {
            const msg = `Expected ${code} to be included from the Greek alphabet (only some long codes were excluded)`;
            await expect(schema.safeParseAsync(code), msg).toPass();
        }
        for (const code of "åäö".split("")) {
            const msg = `Expected ${code} to be included from the Finnish alphabet (only the first half and English vowels were excluded)`;
            await expect(schema.safeParseAsync(code), msg).toPass();
        }
        for (const code of "bcdfghjklmnpqrstvwxz".split("")) {
            const msg = `Expected ${code} to be included from the English alphabet (only the vowels were excluded)`;
            await expect(schema.safeParseAsync(code), msg).toPass();
        }
    });
});
