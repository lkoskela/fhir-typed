import { processResource as processCodeSystem } from "@src/schemas/parsing/codesystem/schema-generator.js";
import { ResourceFile } from "@src/schemas/types/index.js";
import { z, ZodSchema } from "zod";
import { GreekAlphabetCodeSystem, resourceFile } from "@tests/__helpers/fixtures/index.js";

describe("CodeSystem", () => {
    describe("complete", async () => {
        let schema: ZodSchema = z.any();

        const greekAlphabetFile: ResourceFile = resourceFile(GreekAlphabetCodeSystem);

        const schemas: Record<string, ZodSchema> = {};
        const resources: Record<string, any> = {};
        const contribute = (rf: ResourceFile, resource: any | undefined, schema: ZodSchema) => {
            schemas[rf.url] = schema;
            resources[rf.url] = resource;
        };
        const resolveSchema = (nameOrUrl: string) => schemas[nameOrUrl];
        const resolveResource = (nameOrUrl: string) => resources[nameOrUrl];

        beforeAll(async () => {
            await processCodeSystem(
                greekAlphabetFile,
                GreekAlphabetCodeSystem,
                contribute,
                resolveSchema,
                resolveResource
            );
            schema = schemas[greekAlphabetFile.url];
        });

        it("should generate a schema for the code system", () => {
            expect(schema).toBeDefined();
            expect(schema).toHaveProperty("safeParseAsync");
        });

        it("accepts all its concepts", () => {
            const codes = GreekAlphabetCodeSystem.concept?.map((c: any) => c.code as string) ?? [];
            expect(codes, `Expected the code system to have concepts`).toBeDefined();
            expect(codes.length, `Expected the code system to define at least 1 concept`).toBeGreaterThan(0);
            codes.forEach((code: string) => {
                const msg = `Expected ${code} to be accepted by the ${GreekAlphabetCodeSystem.url}`;
                expect(schema.safeParseAsync(code), msg).toPass();
            });
        });

        it("rejects unknown concepts", async () => {
            await expect(schema.safeParseAsync("nosuchcodehere")).toFail();
        });
    });
});
