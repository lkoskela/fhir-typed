import { z } from "zod";

export const SimpleTypeSchemas: Record<string, z.Schema> = {
    // https://build.fhir.org/datatypes.html#string
    string: z.string(),

    // https://build.fhir.org/datatypes.html#canonical
    canonical: z.string(),

    // https://build.fhir.org/datatypes.html#boolean
    boolean: z.boolean(),

    // https://build.fhir.org/datatypes.html#integer
    integer: z.number(),

    // https://build.fhir.org/datatypes.html#integer64
    integer64: z.number(),

    // https://build.fhir.org/datatypes.html#base64Binary
    base64Binary: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),

    // https://build.fhir.org/datatypes.html#unsignedInt
    unsignedInt: z.number().min(0),

    // https://build.fhir.org/datatypes.html#positiveInt
    positiveInt: z.number().min(1),

    // https://build.fhir.org/datatypes.html#instant
    instant: z
        .string()
        .regex(
            /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/
        ),

    // https://build.fhir.org/datatypes.html#time
    time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?$/),

    // https://build.fhir.org/datatypes.html#dateTime
    dateTime: z
        .string()
        .regex(
            /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?)?)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)?)?)?$/
        ),

    // https://build.fhir.org/datatypes.html#date
    date: z
        .string()
        .regex(/^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$/),

    // https://build.fhir.org/datatypes.html#decimal
    decimal: z.string().regex(/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,17})?([eE][+-]?[0-9]{1,9}})?$/),

    // https://build.fhir.org/datatypes.html#code
    code: z.string().regex(/^[^\s]+( [^\s]+)*$/),

    // https://build.fhir.org/datatypes.html#id
    id: z.string().regex(/^[A-Za-z0-9\-\.]{1,64}$/),

    // https://build.fhir.org/datatypes.html#oid
    oid: z.string().regex(/^urn:oid:[0-2](\.(0|[1-9][0-9]*))+$/),

    // https://build.fhir.org/datatypes.html#uuid
    uuid: z.string().regex(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),

    // https://build.fhir.org/datatypes.html#uri
    uri: z.string().regex(/^[^\s]+/),

    // https://build.fhir.org/datatypes.html#url
    url: z.string().regex(/^[^\s]+/),

    // https://build.fhir.org/datatypes.html#markdown
    markdown: z.string().regex(/^[\s\S]+$/),
};

SimpleTypeSchemas["http://hl7.org/fhirpath/System.String"] = SimpleTypeSchemas.string;

Object.values(SimpleTypeSchemas).forEach((schema) => {
    (schema as any).__source = "simple-types.ts";
});

export default SimpleTypeSchemas;
