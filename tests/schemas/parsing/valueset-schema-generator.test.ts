import { processResource as processValueSet } from "@src/schemas/parsing/valueset/schema-generator.js";
import { processResource as processCodeSystem } from "@src/schemas/parsing/codesystem/schema-generator.js";
import { ResourceFile } from "@src/schemas/types/index.js";
import { z, ZodSchema } from "zod";
import {
    codeSystem,
    valueSet,
    filterCodes,
    GreekAlphabetCodeSystem,
    processCodeSystemFromFile,
    processValueSetFromFile,
    resourceFile,
    concepts,
    FinnishAlphabetValueSet,
    EnglishAlphabetCodeSystem,
    GreekAlphabetValueSet,
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
};

const EnglishVowelsValueSet = resourceFile(valueSet("EnglishVowels", "aeiouy".split("")));

const ShortGreekAlphabetValueSet = resourceFile(
    codeSystem(
        "ShortGreekAlphabet",
        filterCodes(GreekAlphabetCodeSystem, (code: string) => code.length < 4)
    )
);

const LongGreekAlphabetValueSet = resourceFile(
    codeSystem(
        "ShortGreekAlphabet",
        filterCodes(GreekAlphabetCodeSystem, (code: string) => code.length > 6)
    )
);

describe("ValueSet", () => {
    /**
     * A ValueSet can include a CodeSystem as-is.
     */
    describe("including a CodeSystem without excludes", () => {
        const codesystemFile: ResourceFile = resourceFile(GreekAlphabetCodeSystem);
        const valuesetFile: ResourceFile = resourceFile(GreekAlphabetValueSet);
        const schemas: Record<string, ZodSchema> = {};
        const contribute = (rf: ResourceFile, schema: ZodSchema) => {
            schemas[rf.url] = schema;
        };
        const resolve = (nameOrUrl: string) => schemas[nameOrUrl];

        beforeAll(async () => {
            await processCodeSystem(codesystemFile, GreekAlphabetCodeSystem, contribute, resolve);
            await processValueSet(valuesetFile, AllButSixLetterGreekAlphabetValueSet, contribute, resolve);
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
    describe("including multiple CodeSystems", () => {
        const ShortGreekAlphabetValueSet = resourceFile(
            codeSystem(
                "ShortGreekAlphabet",
                filterCodes(GreekAlphabetCodeSystem, (code: string) => code.length < 4)
            )
        );

        const LongGreekAlphabetValueSet = resourceFile(
            codeSystem(
                "ShortGreekAlphabet",
                filterCodes(GreekAlphabetCodeSystem, (code: string) => code.length > 6)
            )
        );

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
                        system: ShortGreekAlphabetValueSet.url,
                    },
                    {
                        system: LongGreekAlphabetValueSet.url,
                    },
                ],
            },
        });

        const schemas: Record<string, ZodSchema> = {};
        let schema: ZodSchema = z.never();

        const contribute = (rf: ResourceFile, schema: ZodSchema) => {
            schemas[rf.url] = schema;
        };
        const resolve = (nameOrUrl: string) => schemas[nameOrUrl];

        beforeAll(async () => {
            await processCodeSystemFromFile(ShortGreekAlphabetValueSet, contribute, resolve);
            await processCodeSystemFromFile(LongGreekAlphabetValueSet, contribute, resolve);
            await processValueSet(valueSet, AllButSixLetterGreekAlphabetValueSet, contribute, resolve);
            schema = schemas[valueSet.url];
        });

        it("contains concepts that were included from the first code system", async () => {
            await expect(schema.safeParseAsync("pi")).toPass();
            await expect(schema.safeParseAsync("rho")).toPass();
        });

        it("contains concepts that were included from the second code system", async () => {
            await expect(schema.safeParseAsync("epsilon")).toPass();
            await expect(schema.safeParseAsync("omicron")).toPass();
        });

        it("rejects concepts that were not included", async () => {
            await expect(schema.safeParseAsync("alpha")).toFail();
            await expect(schema.safeParseAsync("gamma")).toFail();
        });
    });

    /**
     * A ValueSet can include and exclude CodeSystems.
     */
    describe("including and excluding concepts from CodeSystems and ValueSets", () => {
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
                        system: ShortGreekAlphabetValueSet.url,
                    },
                    {
                        system: LongGreekAlphabetValueSet.url,
                    },
                    {
                        system: EnglishAlphabetCodeSystem.url,
                    },
                ],
            },
        });

        const schemas: Record<string, ZodSchema> = {};
        let schema: ZodSchema = z.never();

        const contribute = (rf: ResourceFile, schema: ZodSchema) => {
            schemas[rf.url] = schema;
        };
        const resolve = (nameOrUrl: string) => schemas[nameOrUrl];

        beforeAll(async () => {
            // Process the CodeSystems first, because ValueSets depend on them. Also, start with the
            // full Greek alphabet, because the other Greek alphabet value sets exclude some of its codes.
            await processCodeSystemFromFile(resourceFile(GreekAlphabetCodeSystem), contribute, resolve);
            await processCodeSystemFromFile(ShortGreekAlphabetValueSet, contribute, resolve);
            await processCodeSystemFromFile(LongGreekAlphabetValueSet, contribute, resolve);
            await processCodeSystemFromFile(EnglishAlphabetCodeSystem, contribute, resolve);
            // Process the ValueSets last, because they depend on the CodeSystems.
            await processValueSetFromFile(FinnishAlphabetValueSet, contribute, resolve);
            await processValueSetFromFile(combinedValueSet, contribute, resolve);
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
    describe("including and excluding concepts from CodeSystems and ValueSets", async () => {
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
                        system: ShortGreekAlphabetValueSet.url,
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

        const schemas: Record<string, ZodSchema> = {};
        let schema: ZodSchema = z.never();

        const contribute = (rf: ResourceFile, schema: ZodSchema) => {
            schemas[rf.url] = schema;
        };
        const resolve = (nameOrUrl: string) => schemas[nameOrUrl];

        beforeAll(async () => {
            // Process the CodeSystems first, because ValueSets depend on them. Also, start with the
            // full Greek alphabet, because the other Greek alphabet value sets exclude some of its codes.
            await processCodeSystemFromFile(resourceFile(GreekAlphabetCodeSystem), contribute, resolve);
            await processCodeSystemFromFile(ShortGreekAlphabetValueSet, contribute, resolve);
            await processCodeSystemFromFile(LongGreekAlphabetValueSet, contribute, resolve);
            await processCodeSystemFromFile(EnglishAlphabetCodeSystem, contribute, resolve);
            // Process the ValueSets last, because they depend on the CodeSystems.
            await processValueSetFromFile(FinnishAlphabetValueSet, contribute, resolve);
            await processValueSetFromFile(combinedValueSet, contribute, resolve);
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
});
