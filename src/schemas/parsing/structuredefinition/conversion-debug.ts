import { z } from "zod";

import { IntermediateFormat, IntermediateStructureElement, stringifyCardinality } from "./intermediate-format.js";
import { Schemas } from "@src/schemas/types/index.js";

type SchemaResolverFn = (nameOrUrl: string) => undefined | z.Schema;

function and(a: any, b: any): any {
    return { __type: "And", __schemas: [a, b] };
}

function Any(source?: string): any {
    return { __type: "Any", __source: source || "conversion-debug.ts::Any()" };
}

export function convertStructureToDebugSchema(
    intermediate: IntermediateStructureElement,
    baseDefinition: string | undefined,
    resolveSchema: SchemaResolverFn
): any {
    /**
     * Wrap the given schema in an array if the cardinality is 0..* or 1..*, and
     * make it optional if the minimum cardinality is 0.
     *
     * @param itemTypeSchema The original schema for the field's item type.
     * @param min Minimum cardinality
     * @param max Maximum cardinality
     * @returns A new schema with the given cardinality applied.
     */
    function applyCardinality(itemTypeSchema: any, min: number, max: number): any {
        const cardinality = stringifyCardinality(min, max);
        // make an array if max>1
        const schema =
            max > 1 ? { __type: "Array", __itemType: itemTypeSchema, __cardinality: cardinality } : itemTypeSchema;
        // make optional if min=0
        return min === 0 ? { __type: "Optional", __itemType: itemTypeSchema, __cardinality: cardinality } : schema;
    }

    function createShape(intermediate: IntermediateStructureElement): Record<string, any> {
        const shape: Record<string, any> = {};
        intermediate.__children.forEach((child) => {
            let schema =
                resolveSchema(child.type) ||
                Any(`Defaulting to Any because resolveSchema(${JSON.stringify(child.type)}) returned undefined`);
            schema = applyCardinality({ ...schema }, child.min, child.max);
            child.constraint.forEach((c) => {
                const source = c.source ? ` (source: ${c.source})` : "";
                const message = `${c.key}: ${c.human}${source} [${c.expression}]`;
                schema.__constraints = schema.__constraints || [];
                schema.__constraints.push(message);
            });
            if (child.__children.length > 0) {
                const childrenShape: Record<string, any> = {};
                child.__children.forEach((child) => {
                    childrenShape[child.fieldName] = createSchema(child);
                });
                schema = and(schema, childrenShape);
            }
            shape[child.fieldName] = schema;
        });
        return shape;
    }

    function resolveBaseType(baseType: string): any | undefined {
        if (baseType === "boolean") {
            return `z.boolean().or(z.enum(["true", "false"]))`;
        } else if (baseType === "choice-of-type") {
            return undefined;
        }
        let schema: any = resolveSchema(baseType);
        if (schema === undefined && !baseType.match(/^https?:\/\//m)) {
            schema = resolveSchema(`http://hl7.org/fhir/StructureDefinition/${baseType}`);
            if (schema) {
                schema = `http://hl7.org/fhir/StructureDefinition/${baseType} from ${
                    schema.__source || "unknown source"
                }`;
            }
        }
        if (schema === undefined) {
            schema = Schemas[baseType];
            if (schema) {
                schema = `Schemas[${JSON.stringify(baseType)}]`;
            }
        }
        return `${baseType} from ${(schema as any).__source || "unknown source"}`;
    }

    function createSchema(intermediate: IntermediateStructureElement, baseType?: string): any {
        let schema = resolveBaseType(baseType || intermediate.type);
        const shape: Record<string, any> = createShape(intermediate);
        if (Object.keys(shape).length > 0) {
            const schemaForChildren = shape;
            schema = schema ? and(schema, schemaForChildren) : schemaForChildren;
        }
        return applyCardinality(schema || Any(), intermediate.min, intermediate.max);
    }

    return and(createSchema({ ...intermediate, min: 1, max: 1 }, baseDefinition), {
        resourceType: `z.string().optional()`,
    });
}

export function convertToDebugSchema(imf: IntermediateFormat, resolveSchema: SchemaResolverFn): any {
    return convertStructureToDebugSchema(imf.structure, imf.baseDefinition, resolveSchema);
}
