import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";

import { ResourceObject } from "@src/schemas/utils/dependencies.js";
import { ResourceFile } from "@src/schemas/types/index.js";

function sha(input: string): string {
    return createHash("sha1").update(input).digest("hex");
}

export function stubResourceFile(props: Partial<ResourceFile> | undefined, resource?: any): ResourceFile {
    let filePath = "file.json";
    if (resource) {
        const content = JSON.stringify(resource, null, 2);
        filePath = resource
            ? join(tmpdir(), `${resource.resourceType || "Unknown"}-${sha(content)}.json`)
            : "whatever.json";
        writeFileSync(filePath, content, { encoding: "utf-8" });
        // console.log(`Stubbed resource file at ${filePath}\n${content}`);
    }
    const name = resource?.name || "WhateverResourceName";
    const resourceType = resource?.resourceType || "CodeSystem";
    const url = resource?.url || `https://whatever.com/${resourceType}/${name}`;
    return {
        filePath,
        resourceType,
        name,
        url,
        ...(props || {}),
    } as ResourceFile;
}

export function urlForResource(resourceType: string, resourceName: string): string {
    const lastPart = resourceName
        .split(/(?<=[a-z])(?=[A-Z])/gm)
        .join("-")
        .toLowerCase();
    return `https://acme.co/${resourceType}/${lastPart}`;
}

function stubResource(resourceType: string, props?: any): ResourceObject {
    const resourceName = props?.name || `Some${resourceType}`;
    const canonical = props?.url || urlForResource(resourceType, resourceName);
    return {
        resourceType: resourceType,
        name: resourceName,
        url: canonical,
        ...(props || {}),
    } as ResourceObject;
}

export function stubValueSet(props?: any): ResourceObject {
    return stubResource("ValueSet", props);
}

export function stubStructureDefinition(props?: any): ResourceObject {
    return stubResource("StructureDefinition", props);
}
