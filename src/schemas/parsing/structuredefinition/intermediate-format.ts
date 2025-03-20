import {
    ElementDefinition,
    ElementDefinitionConstraint,
    Quantity,
    StructureDefinition,
} from "@src/generated/FHIR-r4.js";
import { unique, uniqueBy } from "@src/utils/arrays.js";

export type IntermediateStructureElement = {
    id?: string; // "Patient"
    path: string; // "Patient"
    sliceName?: string; // e.g. "PIC" if the id is "Patient.identifier:PIC"
    fieldName: string; // e.g. "name" if the path is "Patient.name"
    min: number; // usually 0 or 1,
    max: number; // usually 1 or "*" i.e. MAX_VALUE
    type: string; // e.g. "uri" or "http://hl7.org/fhirpath/System.String"
    types: string[]; // e.g. ["boolean", "dateTime"] if type is "choice-of-type"
    maxLength?: number; // maximum length of the field, if it's a string type
    "defaultValue[x]"?: string | number | Quantity;
    "pattern[x]"?: string | number | object | Array<string> | Array<number> | Array<object>; // mandatory value for this path e.g. patternUri: "https://hl7.fi/fhir/finnish-base-profiles/CodeSystem/fi-base-security-label-cs"
    "fixed[x]"?: string | number | object | Array<string> | Array<number> | Array<object>; // mandatory value for this path e.g. fixedUri: "https://hl7.fi/fhir/finnish-base-profiles/CodeSystem/fi-base-security-label-cs"
    "minValue[x]"?: string | number | Quantity; // minimum allowed value for this field
    "maxValue[x]"?: string | number | Quantity; // maximum allowed value for this field
    constraint: ElementDefinitionConstraint[];
    __children: IntermediateStructureElement[];
    binding?: string; // e.g. "http://hl7.org/fhir/ValueSet/languages" or "http://hl7.org/fhir/ValueSet/all-languages" - we're only interested in "required" bindings that refer to a ValueSet
    slicing?: {
        discriminator: {
            type: "value" | "exists" | "type" | "profile" | "pattern";
            path: string;
        }[];
        ordered: boolean;
        rules: "closed" | "open" | "openAtEnd";
        slices: IntermediateStructureSlice[];
    };
};

export type IntermediateStructureSlice = IntermediateStructureElement & {
    sliceName: string; // e.g. "turvakielto",
};

export type IntermediateFormat = {
    resourceType: "StructureDefinition";
    kind: "resource" | "complex-type" | "primitive-type" | "logical";
    type: string; // e.g. "Patient"
    url: string;
    baseDefinition?: string;
    structure: IntermediateStructureElement;
};

/**
 * Convert the given R4 `StructureDefinition` to an intermediate format better suited for further processing.
 * The intermediate format is a more convenient format for generating Zod schemas as it is a tree-like structure
 * rather than a flat list of `ElementDefinition` objects like the `StructureDefinition`.
 *
 * @param sd The R4 `StructureDefinition` to convert to an intermediate format.
 * @returns The equivalent intermediate format.
 */
export function convertStructureDefinitionToIntermediateFormat(sd: StructureDefinition): IntermediateFormat {
    function uniquenessKeyForConstraint(constraint: ElementDefinitionConstraint): string {
        return constraint.expression || constraint.human || constraint.xpath || constraint.key || "";
    }
    function collectElementConstraints(element: ElementDefinition): ElementDefinitionConstraint[] {
        return (element.constraint || [])
            .filter((c) => c.severity === "error") // we're only interested in constraints that are errors
            .filter((c) => c.source !== "http://hl7.org/fhir/StructureDefinition/Element") // omit the troublesome constraints about an Element having a @value or children.
            .map((c) => ({ source: element.id || element.path, ...c })); // assign the element id/path as the source of the constraint if not explicitly set.
    }

    const allConstraints = uniqueBy(
        (sd.snapshot?.element || []).flatMap(collectElementConstraints),
        uniquenessKeyForConstraint
    );

    function resolveNamedConstraint(name: string): ElementDefinitionConstraint | undefined {
        return allConstraints.find((constraint) => constraint.key === name);
    }

    function grabChoiceOfTypeValue(element: ElementDefinition, fieldName: string): string | undefined {
        const prefix = fieldName.replace(/\[x\]$/, "");
        const values = Object.keys(element)
            .filter((key) => key.startsWith(prefix))
            .map((key) => (element as any)[key]);
        return values.find((value) => value !== undefined);
    }

    function convertElement(element: ElementDefinition): IntermediateStructureElement {
        // Collect the binding, if it's a required binding and refers to a ValueSet
        const binding = element.binding?.strength === "required" ? element.binding.valueSet : undefined;

        // Collect all constraints, both directly via the "constraint" array and indirectly via the "condition" array
        const directConstraints = collectElementConstraints(element);
        const referencedConstraints = (element.condition?.map(resolveNamedConstraint) || []).filter((c) => !!c);
        const combinedConstraints = [...directConstraints, ...referencedConstraints];

        const result: IntermediateStructureElement = {
            id: element.id,
            path: element.path,
            sliceName: element.sliceName,
            fieldName: element.path.split(".").slice(-1)[0],
            min: element.min || 0,
            max: element.max ? (element.max === "*" ? MAX_CARDINALITY : parseInt(element.max)) : 1,
            type: element.type?.length === 1 ? element.type[0].code : "choice-of-type",
            types: (element.type || []).map((type) => type.code),
            maxLength: element.maxLength,
            "defaultValue[x]": grabChoiceOfTypeValue(element, "defaultValue[x]"),
            "pattern[x]": grabChoiceOfTypeValue(element, "pattern[x]"),
            "fixed[x]": grabChoiceOfTypeValue(element, "fixed[x]"),
            "minValue[x]": grabChoiceOfTypeValue(element, "minValue[x]"),
            "maxValue[x]": grabChoiceOfTypeValue(element, "maxValue[x]"),
            constraint: uniqueBy(combinedConstraints, uniquenessKeyForConstraint),
            __children: [],
            binding: binding,
            slicing: element.slicing
                ? {
                      discriminator: element.slicing.discriminator || [],
                      ordered: element.slicing.ordered || false,
                      rules: element.slicing.rules,
                      slices: [],
                  }
                : undefined,
        };
        return result;
    }

    function findAllElementIds(root: IntermediateStructureElement): string[] {
        return unique([
            root.id || root.path,
            ...root.__children.flatMap(findAllElementIds),
            ...(root.slicing?.slices || []).flatMap(findAllElementIds),
        ])
            .filter((s) => s !== "")
            .sort();
    }

    function findElementById(
        root: IntermediateStructureElement,
        parentId: string
    ): IntermediateStructureElement | undefined {
        if (root.id === parentId || root.path === parentId) {
            return root;
        }
        for (const child of root.__children) {
            const found = findElementById(child, parentId);
            if (found) {
                return found;
            }
        }
        for (const slice of root.slicing?.slices || []) {
            const found = findElementById(slice, parentId);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    function parentIdOf(element: IntermediateStructureElement): string {
        if (element.sliceName && element.id?.match(/:[^.:]+$/)) {
            return element.id.replace(/:[^.:]+$/, "");
        } else {
            return (element.id || element.path).split(".").slice(0, -1).join(".");
        }
    }

    function convertChildElement(root: IntermediateStructureElement, element: ElementDefinition) {
        const converted = convertElement(element);
        const parentId = parentIdOf(converted);
        const parent = findElementById(root, parentId);
        if (!parent) {
            throw new Error(
                `Could not find parent element of ${
                    converted.id || converted.path
                } with id ${parentId} among ${findAllElementIds(root)}`
            );
        }
        if (converted.sliceName) {
            // TODO: implement slicing
            // This element defines a new slice of the parent element.
            if (parent.slicing?.slices) {
                parent.slicing.slices.push({
                    id: converted.id,
                    sliceName: converted.sliceName,
                    path: element.path,
                    fieldName: element.path.split(".").slice(-1)[0],
                    min: element.min || 0,
                    max: element.max ? (element.max === "*" ? MAX_CARDINALITY : parseInt(element.max)) : 1,
                    type: element.type?.length === 1 ? element.type[0].code : "choice-of-type",
                    types: (element.type || []).map((type) => type.code),
                    constraint: [],
                    __children: [],
                    slicing: undefined,
                } satisfies IntermediateStructureSlice);
            } else {
                console.warn(
                    `Could not contribute a slice ${
                        converted.id
                    } of parent ${parentId} as it has no slicing structure: ${JSON.stringify(parent)}`
                );
            }
            return;
        } else {
            // if (converted.id?.includes("Patient.identifier:")) {
            //     console.log(`Adding ${converted.id || converted.path} as a child of ${parent.id || parent.path}`);
            // }
            parent.__children.push(converted);
        }
    }

    const elements = sd.snapshot?.element || [];
    const rootElement = elements.find((element) => element.id === sd.type);
    if (!rootElement) {
        throw new Error(`Could not find root element for StructureDefinition ${sd.url}`);
    }

    const root = convertElement({ ...rootElement, type: [{ code: sd.type }] });
    elements
        .filter((e) => e !== rootElement)
        .forEach((element) => {
            convertChildElement(root, element);
        });

    const convertedStructureDefinition: IntermediateFormat = {
        resourceType: "StructureDefinition",
        kind: "resource",
        type: sd.type,
        url: sd.url,
        baseDefinition: sd.baseDefinition,
        structure: root,
    };
    const DEBUGGED_SCHEMAS: string[] = [
        /* "http://hl7.org/fhir/StructureDefinition/Meta", "Meta", "http://hl7.org/fhir/StructureDefinition/Patient" */
    ];
    if (DEBUGGED_SCHEMAS.includes(sd.url)) {
        console.log(
            `CONVERTED STRUCTURE DEFINITION FOR ${sd.url}:\n`,
            JSON.stringify(convertedStructureDefinition, null, 2)
        );
    }
    return convertedStructureDefinition;
}

/**
 * Generate a human-readable representation of the intermediate format suitable
 * for debugging.
 *
 * @param intermediate The intermediate format to pretty print.
 * @returns {string} human-readable representation of the intermediate format.
 */
export function prettyPrintIntermediateFormat(intermediate: IntermediateFormat): string {
    return `<<${intermediate.url}>>\n` + prettyPrintIntermediateStructure(intermediate.structure);
}

/**
 * Maximum cardinality for a field.
 * This is used to represent fields that can have an unlimited number of occurrences.
 */
export const MAX_CARDINALITY = 999999999;

/**
 * Create a string representation of the cardinality of a field.
 *
 * @param element `IntermediateStructureElement` or `number`
 * @param max Maximum cardinality, defaults to `MAX_CARDINALITY`. Can be omitted if the first parameter is an `IntermediateStructureElement`.
 * @returns String representation of the cardinality
 */
export function stringifyCardinality(
    element: IntermediateStructureElement | number,
    max: number = MAX_CARDINALITY
): string {
    if (typeof element === "number") {
        const min: number = element;
        return `${min}..${max === MAX_CARDINALITY ? "*" : max}`;
    } else {
        return `${element.min}..${element.max === MAX_CARDINALITY ? "*" : element.max}`;
    }
}

/**
 * Generate a human-readable representation of the intermediate format suitable
 * for debugging.
 *
 * @param intermediate The intermediate format to pretty print.
 * @returns {string} human-readable representation of the intermediate format.
 */
export function prettyPrintIntermediateStructure(structure: IntermediateStructureElement): string {
    function prettyPrintElement(element: IntermediateStructureElement, indent: string): string {
        const INDENT = "    ";
        const typeDescription = element.type === "choice-of-type" ? element.types.join(" | ") : element.type;
        const cardinality = stringifyCardinality(element);
        const lines = [
            `${indent}- ${element.sliceName ? `@slice ${element.path}:${element.sliceName}` : element.fieldName} (${
                element.path
            }${element.sliceName ? `:${element.sliceName}` : ""}: ${typeDescription}) ${cardinality}`,
            ...element.constraint.map((c) => {
                const source = c.source === element.id ? "" : ` (source: ${c.source || "unknown"})`;
                const content = `@constraint: [${c.key}] ${c.human} ${source}`.trim();
                return `${indent}  ${content}`;
            }),
        ];
        if (element["pattern[x]"]) {
            lines.push(`${indent}  @pattern: ${JSON.stringify(element["pattern[x]"])}`);
        }
        if (element["fixed[x]"]) {
            lines.push(`${indent}  @fixed: ${JSON.stringify(element["fixed[x]"])}}`);
        }
        if (element["minValue[x]"]) {
            lines.push(`${indent}  @minValue: ${JSON.stringify(element["minValue[x]"])}}`);
        }
        if (element["maxValue[x]"]) {
            lines.push(`${indent}  @maxValue: ${JSON.stringify(element["maxValue[x]"])}}`);
        }
        if (element["defaultValue[x]"]) {
            lines.push(`${indent}  @defaultValue: ${JSON.stringify(element["defaultValue[x]"])}}`);
        }
        if ((element.slicing?.slices?.length || 0) > 0) {
            const ordered = !!element.slicing?.ordered;
            const rules = element.slicing?.rules || "open";
            const discriminator = element
                .slicing!.discriminator!.map((d) => JSON.stringify({ path: d.path, type: d.type }))
                .join(", ");
            lines.push(
                indent + `  @slices: << ordered:${ordered} rules:${rules} ${discriminator} >>`,
                ...(element.slicing?.slices || []).map((s) => prettyPrintElement(s, indent + INDENT))
            );
        }
        if (element.__children.length > 0) {
            lines.push(
                ...[indent + "  @children:", ...element.__children.map((c) => prettyPrintElement(c, indent + INDENT))]
            );
        }
        return lines.join("\n");
    }

    return prettyPrintElement(structure, "");
}
