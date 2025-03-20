import { z } from "zod";

import SimpleTypeSchemas from "./simple-types.js";
import ComplexTypeSchemas from "./complex-types.js";
import FHIRPathTypeSchemas from "./fhirpath-types.js";

export const Schemas: Record<string, z.Schema> = {
    ...SimpleTypeSchemas,
    ...FHIRPathTypeSchemas,
    ...ComplexTypeSchemas,
};

export type ResourceFile = {
    filePath: string;
    resourceType: string;
    url: string;
    kind?: string;
    name?: string;
    date?: string;
    status?: string;
    experimental?: boolean;
    baseDefinition?: string;
};
