import { ResourceFile } from "@src/schemas/types/index.js";
import { z, ZodSchema } from "zod";
import {
    FIXTURES_DIR,
    GreekAlphabetCodeSystem,
    processResources,
    resourceFile,
} from "@tests/__helpers/fixtures/index.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { join } from "path";

describe("ValueSet filtering concepts from CodeSystems by value", () => {
    /**
     * Example of filtering concepts from a CodeSystem.
     */
    describe("alphabet example", () => {
        const filteredValueSet = resourceFile({
            resourceType: "ValueSet",
            id: "filtered-greek-alphabet",
            url: "http://example.org/fhir/ValueSet/filtered-greek-alphabet",
            version: "1.0.0",
            name: "FilteredGreekAlphabetValueSet",
            status: "active",
            compose: {
                include: [
                    {
                        system: GreekAlphabetCodeSystem.url,
                        filter: [
                            // we'll include only Greek alphabet starting with the letter "p" or "g"
                            // => "gamma", "pi", "phi", "psi"
                            { property: "code", op: "regex", value: "^(p|g)" },
                            // that also end with an "i" or "a":
                            // => "gamma", "pi", "phi", "psi"
                            { property: "code", op: "regex", value: "[ai]$" },
                            // and have 2-7 letters
                            // => "gamma", "pi", "phi", "psi"
                            { property: "code", op: "regex", value: "^[a-z]{2,7}$" },
                            // and is one of "gamma", "beta", or "phi"
                            // => "gamma", "phi"
                            { property: "code", op: "in", value: "gamma,beta,phi" },
                            // and isn't one of "alpha", "beta", "gamma" or "delta"
                            // => "phi"
                            { property: "code", op: "not-in", value: "alpha,beta,gamma,delta" },
                            // that should only include "phi" because "pi" is just
                            // two letters, "psi" isn't on the "in" list, and "gamma"
                            // is on the "not-in" list...
                        ],
                    },
                ],
            },
        });

        const schemas: Record<string, ZodSchema> = {};
        const resources: Record<string, any> = {};
        let schema: ZodSchema = z.never();

        const contributeSchema = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
            schemas[rf.url] = schema;
            resources[rf.url] = resource;
        };
        const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
        const resolveResource = (nameOrUrl: string) => undefined;

        beforeAll(async () => {
            await processResources(
                contributeSchema,
                resolveSchema,
                resolveResource,
                resourceFile(GreekAlphabetCodeSystem),
                filteredValueSet
            );
            schema = schemas[filteredValueSet.url];
        });

        it("includes concepts that match all three filters", async () => {
            await expect(schema.safeParseAsync("phi")).toPass();
        });

        it("excludes concepts that only match some of the filters", async () => {
            await expect(schema.safeParseAsync("pi")).toFail();
            await expect(schema.safeParseAsync("xi")).toFail();
            await expect(schema.safeParseAsync("chi")).toFail();
            await expect(schema.safeParseAsync("eta")).toFail();
            await expect(schema.safeParseAsync("psi")).toFail();
        });

        it("excludes concepts that match none of the filters", async () => {
            await expect(schema.safeParseAsync("alpha")).toFail();
            await expect(schema.safeParseAsync("beta")).toFail();
            await expect(schema.safeParseAsync("epsilon")).toFail();
        });
    });
});

describe("ValueSet filtering concepts from CodeSystems by hierarchy", () => {
    /**
     * Example of filtering concepts from a CodeSystem by is-a, descendent-of,
     * or generalizes relationships.
     */
    describe('"resources" example', () => {
        const allResources = resourceFile(
            parseJsonFromFilePath(join(FIXTURES_DIR, "codesystems/resources-codesystem.json"))
        );
        const youngResources = resourceFile(
            parseJsonFromFilePath(join(FIXTURES_DIR, "valuesets/young-resources-valueset.json"))
        );
        const liveResources = resourceFile(
            parseJsonFromFilePath(join(FIXTURES_DIR, "valuesets/live-resources-valueset.json"))
        );

        const schemas: Record<string, ZodSchema> = {};
        const resources: Record<string, any> = {};

        beforeAll(async () => {
            const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
                if (schemas[rf.url]) {
                    console.warn(`Overriding previously contributed schema for ${rf.url}!`);
                }
                schemas[rf.url] = schema;
                resources[rf.url] = resource;
            };
            const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
            const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];
            await processResources(
                contribute,
                resolveSchema,
                resolveResource,
                allResources,
                youngResources,
                liveResources
            );
        });

        describe("live resources (descendent-of)", () => {
            let schema: ZodSchema = z.never().refine((value) => false, `This schema should never be used!`);
            beforeAll(async () => {
                schema = schemas[liveResources.url];
            });

            describe("includes all humans", async () => {
                ["human", "child", "adult", "man", "woman", "boy", "girl"].forEach(async (code) => {
                    it(`includes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toPass();
                    });
                });
            });

            describe("excludes all machines", async () => {
                ["machine", "computer", "laptop", "desktop", "robot"].forEach(async (code) => {
                    it(`excludes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toFail();
                    });
                });
            });
        });

        describe("young resources (is-a)", () => {
            let schema: ZodSchema = z.never();
            beforeAll(async () => {
                schema = schemas[youngResources.url];
            });

            describe("includes all underage humans", async () => {
                ["child", "boy", "girl"].forEach(async (code) => {
                    it(`includes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toPass();
                    });
                });
            });

            describe("excludes all adults (or possibly adults)", async () => {
                ["human", "adult", "man", "woman"].forEach(async (code) => {
                    it(`excludes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toFail();
                    });
                });
            });

            describe("excludes all machines", async () => {
                ["machine", "computer", "laptop", "desktop", "robot"].forEach(async (code) => {
                    it(`excludes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toFail();
                    });
                });
            });
        });
    });
});

describe("ValueSet filtering concepts from CodeSystems by properties", () => {
    /**
     * Example of filtering concepts from a CodeSystem by is-a, descendent-of,
     * or generalizes relationships.
     */
    describe('"resources" example', () => {
        const allResources = resourceFile(
            parseJsonFromFilePath(join(FIXTURES_DIR, "codesystems/resources-codesystem.json"))
        );
        const maleResources = resourceFile(
            parseJsonFromFilePath(join(FIXTURES_DIR, "valuesets/male-resources-valueset.json"))
        );

        const schemas: Record<string, ZodSchema> = {};
        const resources: Record<string, any> = {};

        beforeAll(async () => {
            const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
                if (schemas[rf.url]) {
                    console.warn(`Overriding previously contributed schema for ${rf.url}!`);
                }
                schemas[rf.url] = schema;
                resources[rf.url] = resource;
            };
            const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
            const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];
            await processResources(contribute, resolveSchema, resolveResource, allResources, maleResources);
        });

        describe("male resources (property 'gender' = 'male')", () => {
            let schema: ZodSchema = z.never().refine((_) => false, `This schema should never be used!`);

            beforeAll(async () => {
                schema = schemas[maleResources.url];
            });

            describe("includes men and boys", async () => {
                ["man", "boy"].forEach(async (code) => {
                    it(`includes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toPass();
                    });
                });
            });

            describe("excludes women and girls", async () => {
                ["woman", "girl", "boy"].forEach(async (code) => {
                    it(`excludes ${code}`, async () => {
                        await expect(schema.safeParseAsync(code)).toFail();
                    });
                });
            });
        });
    });
});
