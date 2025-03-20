import { z } from "zod";
import fhirpath from "fhirpath";

import {
    IntermediateFormat,
    IntermediateStructureElement,
    IntermediateStructureSlice,
    stringifyCardinality,
} from "./intermediate-format.js";
import { ElementDefinitionConstraint } from "@src/generated/FHIR-r4.js";
import { Schemas } from "@src/schemas/types/index.js";
import { capitalizeFirstLetter, pluralize } from "@src/utils/strings.js";
import { unique } from "@src/utils/arrays.js";
import { MustHaveAtMostOneFieldStartingWith } from "@src/schemas/types/common-refinements.js";

type SchemaResolverFn = (nameOrUrl: string) => undefined | z.Schema;

/**
 * Adds a constraint to the given schema that evaluates the FHIRPath expression defined by the given `ElementDefinitionConstraint`.
 *
 * @param schema The Zod schema to add the constraint to.
 * @param constraint The constraint to add.
 * @returns Updated schema with the constraint added.
 */
function addConstraintToSchema(schema: z.Schema, constraint: ElementDefinitionConstraint): z.Schema {
    const source = constraint.source ? ` (source: ${constraint.source})` : "";
    const message = `${constraint.key}: ${constraint.human}${source} [${constraint.expression}]`;
    //console.log(`Adding constraint ${constraint.key} from ${constraint.source}:   ${constraint.expression}`);
    return schema.superRefine(async (data: any, ctx: z.RefinementCtx) => {
        try {
            const raw = fhirpath.evaluate(data, constraint.expression as string, { rootResource: data }, undefined, {
                async: "always",
                traceFn: (_msg: string, _label: string) => {},
            });
            const result = await Promise.resolve(raw);
            if (result.length > 0 && result.find((r: any) => !!!r)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: message,
                });
            }
        } catch (e) {
            console.error(`Error evaluating constraint ${constraint.key} for ${data.resourceType} ${data.id}: ${e}`);
            console.error(`Constraint: ${constraint.expression}`);
            console.error(`Data: ${JSON.stringify(data, null, 2)}`);
            console.error(`Context: ${JSON.stringify(ctx, null, 2)}`);
        }
    });
}

type RefinementFunction = (data: any, ctx: z.RefinementCtx) => void;

type SliceMatcher = (data: any) => Promise<IntermediateStructureSlice | undefined>;

function fieldAtPath(
    slice: IntermediateStructureSlice,
    pathExpression: string
): IntermediateStructureElement | undefined {
    const path = pathExpression.split(".");
    return path.reduce((element: IntermediateStructureElement | undefined, fieldName: string) => {
        return element?.__children.find((child) => child.fieldName === fieldName);
    }, slice);
}

function createSliceMatcher(intermediate: IntermediateStructureElement): SliceMatcher {
    const { discriminator, slices } = intermediate.slicing!;
    return async (data: any) => {
        for (const slice of slices) {
            const matches: boolean[] = await Promise.all(
                discriminator.map(async (disc) => {
                    const sliceField = fieldAtPath(slice, disc.path);
                    const evaluatedPath = [intermediate.path.split(".").slice(1), disc.path].flat().join(".");
                    const values: any[] = await Promise.resolve(fhirpath.evaluate(data, evaluatedPath));
                    switch (disc.type) {
                        case "exists":
                            // if any of the values is undefined, return false
                            return !values.includes(undefined);
                        case "value":
                            // check for an exact match
                            const expectedValue = sliceField?.["pattern[x]"] || sliceField?.["fixed[x]"];
                            return values[0] === expectedValue;
                        case "pattern":
                            // check for an exact match
                            const expectedPattern = sliceField?.["pattern[x]"] || sliceField?.["fixed[x]"];
                            return values[0] === expectedPattern;
                        case "type":
                        // TODO
                        case "profile":
                        // TODO
                    }
                    return false;
                })
            );
            if (matches.every((m) => m)) {
                // Slice matches all specified discriminators so it's a match!
                return slice;
            }
        }
        return undefined;
    };
}

export async function convertToSchema(imf: IntermediateFormat, resolveSchema: SchemaResolverFn): Promise<z.Schema> {
    type DebugOptions = {
        debug: boolean;
    };
    const defaultDebugOptions: DebugOptions = { debug: false };

    /**
     * Wrap the given schema in an array if the cardinality is 0..* or 1..*, and
     * make it optional if the minimum cardinality is 0.
     *
     * @param itemTypeSchema The original schema for the field's item type.
     * @param min Minimum cardinality
     * @param max Maximum cardinality
     * @returns A new schema with the given cardinality applied.
     */
    function applyCardinality(itemTypeSchema: z.Schema, min: number, max: number): z.Schema {
        const cardinality = stringifyCardinality(min, max);
        // make an array if max>1
        let schema = max > 1 ? z.array(itemTypeSchema).describe(cardinality).min(min).max(max) : itemTypeSchema;
        // make optional if min=0
        return min === 0 ? schema.optional().describe(cardinality) : schema;
    }

    function createRefinementForSlices(
        intermediate: IntermediateStructureElement,
        options?: DebugOptions
    ): RefinementFunction | undefined {
        options = { ...defaultDebugOptions, ...(options || {}) };

        // TODO: We should probably return a single refinement function that checks both slicing stuff
        // and the pattern[x] or fixed[x] constraints!

        if (intermediate.slicing && intermediate.slicing.slices.length > 0) {
            const discriminatorTypes = unique(intermediate.slicing.discriminator.map((d) => d.type));
            const unsupportedDiscriminatorTypes = discriminatorTypes.filter((t) => t !== "value" && t !== "pattern");
            if (unsupportedDiscriminatorTypes.length > 0) {
                // Ignoring slicing of this element because it has unsupported discriminator types.
            } else {
                const sliceMatcher = createSliceMatcher(intermediate);
                // TODO: add a refinement that checks that the path discriminator is present in the data
                // and that the field's value matches the pattern
                return async (data: any, ctx: z.RefinementCtx) => {
                    const slice = await sliceMatcher(data);
                    if (slice) {
                        const evaluatedPath = slice.path.includes(".")
                            ? slice.path.split(".").slice(1).join(".")
                            : slice.path;
                        const dataSection = await Promise.resolve(fhirpath.evaluate(data, evaluatedPath));
                        const sliceSchema = createSchema(slice, undefined, undefined, { ...options, debug: true });
                        if (dataSection.length === 0) {
                            // the validated data does not contain the section defined by the slice's path
                            // so unless the field is required, we can pass the refinement check
                            if (slice.min > 0) {
                                ctx.addIssue({
                                    code: z.ZodIssueCode.custom,
                                    message: `According to slice ${slice.id}, ${slice.path} is required.`,
                                });
                            }
                            return;
                        } else if (dataSection.length === 1) {
                            // The validated data contains a single instance of the slice's designated path
                            // so we can apply validation directly to that value.
                            const sliceResult = await sliceSchema.safeParseAsync(dataSection[0]);
                            if (!sliceResult.success) {
                                const issues = sliceResult.error?.issues || [];
                                issues.forEach((issue) => ctx.addIssue(issue));
                            }
                        } else {
                            // array data sections (more than 1 value) are not yet supported
                        }
                    }
                };
            }
        } else {
            const requiredValue = intermediate["pattern[x]"] || intermediate["fixed[x]"];
            if (requiredValue) {
                return async (data: any, ctx: z.RefinementCtx) => {
                    const value = await Promise.resolve(fhirpath.evaluate(data, intermediate.fieldName));
                    if (value[0] !== requiredValue) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `According to slice ${intermediate.id}, ${
                                intermediate.fieldName
                            } must have the exact value ${JSON.stringify(requiredValue)}.`,
                        });
                    }
                };
            }
        }
        return undefined;
    }

    type ShapeAndRefinements = {
        shape: Record<string, z.Schema>;
        refinements: Array<RefinementFunction>;
    };

    function createShape(intermediate: IntermediateStructureElement, options?: DebugOptions): ShapeAndRefinements {
        options = { ...defaultDebugOptions, ...(options || {}) };
        const shape: Record<string, z.Schema> = {};
        const refinements: Array<RefinementFunction> = [];
        function addChild(child: IntermediateStructureElement) {
            let schema = resolveSchema(child.type) || z.any();
            child.constraint.forEach((c) => {
                schema = addConstraintToSchema(schema, c);
            });
            const refinement = createRefinementForSlices(child, options);
            if (refinement) {
                refinements.push(refinement);
            }
            if (child.__children.length > 0) {
                const childrenShape: Record<string, z.Schema> = {};
                child.__children.forEach((child) => {
                    childrenShape[child.fieldName] = createSchema(child, undefined, undefined, options);
                });
                schema = schema.and(z.object(childrenShape));
            }
            shape[child.fieldName] = applyCardinality(schema, child.min, child.max);
        }
        intermediate.__children.forEach((child) => {
            if (child.fieldName.endsWith("[x]")) {
                const commonPrefix = child.fieldName.slice(0, -3);
                child.types.forEach((variantType) => {
                    const variantFieldName = `${commonPrefix}${capitalizeFirstLetter(variantType)}`;
                    addChild({
                        ...child,
                        fieldName: variantFieldName,
                        type: variantType,
                        types: [],
                        min: 0,
                        max: 1,
                    });
                    const refinement = createRefinementForSlices(child, options);
                    if (refinement) {
                        refinements.push(refinement);
                    }
                });
                refinements.push(MustHaveAtMostOneFieldStartingWith(commonPrefix));
            } else {
                addChild(child);
                const refinement = createRefinementForSlices(child, options);
                if (refinement) {
                    refinements.push(refinement);
                }
            }
        });

        if (intermediate.sliceName && (intermediate.constraint.length > 0 || intermediate.min > 0)) {
            // TODO: if the slice "root" specifies some kind of constraints, we should add a refinement
            // that checks that these constraints are satisfied if the slice matches the data.
            console.warn(
                `SLICING: createShape(${
                    intermediate.id
                }) should contribute a refinement for the slice because it has ${pluralize(
                    intermediate.constraint,
                    "constraint"
                )} and cardinality of ${stringifyCardinality(intermediate)}...?`
            );
        } else if (intermediate.slicing && intermediate.slicing.slices.length > 0) {
            const refinement = createRefinementForSlices(intermediate);
            if (refinement) {
                refinements.push(refinement);
            }
        } else if (
            intermediate.slicing &&
            intermediate.slicing.slices.length === 0 &&
            intermediate.slicing.rules === "closed"
        ) {
            // If the slicing is defined with "closed" rules,but no slices have been defined, does that constitute an error?
            console.warn(
                `SLICING: ${intermediate.id} has slicing, but no slices are defined. This is probably an error.`
            );
        } else {
            // Cases ending up here can be safely ignored because they do not introduce any new constraints and the element's
            // children (fields) are handled outside the "slicing" logic.
        }

        return { shape, refinements };
    }

    function resolveBaseType(baseType: string): z.Schema | undefined {
        if (baseType === "boolean") {
            return z.boolean().or(z.enum(["true", "false"]));
        } else if (baseType === "choice-of-type") {
            return undefined;
        }
        let schema = resolveSchema(baseType);
        if (schema === undefined && !baseType.match(/^https?:\/\//m)) {
            schema = resolveSchema(`http://hl7.org/fhir/StructureDefinition/${baseType}`);
        }
        if (schema === undefined) {
            schema = Schemas[baseType];
        }
        return schema;
    }

    function applyRefinementsToSchema(
        schema: z.Schema,
        refinements: Array<RefinementFunction>,
        options?: DebugOptions
    ): z.Schema {
        options = { ...defaultDebugOptions, ...(options || {}) };
        const refined = refinements.reduce((acc, refinement) => acc.superRefine(refinement), schema);
        return schema ? schema.and(refined) : refined;
    }

    function createSchema(
        intermediate: IntermediateStructureElement,
        baseType?: string,
        extendingType?: string,
        options?: DebugOptions
    ): z.Schema {
        options = { ...defaultDebugOptions, ...(options || {}) };
        let schema = resolveBaseType(baseType || intermediate.type);
        const { shape, refinements } = createShape(intermediate, options);
        if (Object.keys(shape).length > 0) {
            schema = z.object(shape);
            (schema as any).__source =
                (schema as any).__source || `conversion.ts::createSchema() z.object(shape) for ${intermediate.id} #1`;
            schema = applyRefinementsToSchema(schema, refinements, options);
            (schema as any).__source =
                (schema as any).__source || `conversion.ts::createSchema() z.object(shape) for ${intermediate.id} #2`;
        } else if (refinements.length > 0) {
            if (schema === undefined) {
                if (options.debug) {
                    console.log(
                        `createSchema() creating a new z.object() for a shape of ${pluralize(
                            Object.keys(shape),
                            "field"
                        )}: ${Object.keys(shape).sort().join(", ")}`
                    );
                }
                schema = z.any();
                (schema as any).__source =
                    (schema as any).__source || `conversion.ts::createSchema() z.any() for ${intermediate.id} #1`;
                if (options.debug) {
                    console.log(
                        `createSchema() adding ${pluralize(refinements, "refinement")} to newly created schema from ${
                            (schema as any).__source || "unknown source"
                        }`
                    );
                }
            } else {
                if (options.debug) {
                    console.log(
                        `createSchema() adding ${pluralize(refinements, "refinement")} to existing schema from ${
                            (schema as any).__source || "unknown source"
                        }`
                    );
                }
            }
            (schema as any).__source =
                (schema as any).__source || `conversion.ts::createSchema() z.any() for ${intermediate.id} #2`;
            schema = applyRefinementsToSchema(schema, refinements, options);
            (schema as any).__source =
                (schema as any).__source || `conversion.ts::createSchema() z.any() for ${intermediate.id} #3`;
        }
        schema = schema || z.any();
        (schema as any).__source =
            (schema as any).__source ||
            `conversion.ts::createSchema() last fallback - couldn't resolve schema for ${
                intermediate.id
            }: ${JSON.stringify({ type: intermediate.type, types: intermediate.types, baseType, extendingType })}`;
        return applyCardinality(schema, intermediate.min, intermediate.max);
    }

    let schema = createSchema({ ...imf.structure, min: 1, max: 1 }, imf.baseDefinition, imf.url);
    if (imf.kind === "resource") {
        // If the StructureDefinition is for a resource, and the resource has a "resourceType" field,
        // it must have the correct value. The field must be optional, though, since this same schema
        // is used for all resources, for example, including Reference fields within a Resource in which
        // case the "resourceType" field is not present.
        schema = schema.and(z.object({ resourceType: z.string().optional() }));
    }
    (schema as any).__source = "conversion.ts::convertToSchema()";
    return schema;
}
