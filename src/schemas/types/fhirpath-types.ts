import { z } from "zod";

import SimpleTypeSchemas from "./simple-types.js";

// https://build.fhir.org/fhirpath.html#types
// http://hl7.org/fhirpath/N1/#quantity
export const FHIRPathTypeSchemas: Record<string, z.Schema> = {
    "http://hl7.org/fhirpath/System.Boolean": SimpleTypeSchemas.boolean,
    "http://hl7.org/fhirpath/System.String": SimpleTypeSchemas.string,
    "http://hl7.org/fhirpath/System.Integer": SimpleTypeSchemas.integer,
    "http://hl7.org/fhirpath/System.Long": SimpleTypeSchemas.integer64,
    "http://hl7.org/fhirpath/System.Decimal": SimpleTypeSchemas.decimal,
    "http://hl7.org/fhirpath/System.DateTime": SimpleTypeSchemas.dateTime,
    "http://hl7.org/fhirpath/System.Time": SimpleTypeSchemas.time,
    "http://hl7.org/fhirpath/System.Quantity": z.string().regex(/^(\d+(?:\.\d+)?) '[^\s].*'$/),
};

Object.values(FHIRPathTypeSchemas).forEach((schema) => {
    (schema as any).__source = "fhirpath-types.ts";
});

export default FHIRPathTypeSchemas;
