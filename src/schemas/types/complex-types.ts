import { z } from "zod";

import SimpleTypeSchemas from "./simple-types.js";
import { MustHaveAtMostOneFieldStartingWith, ObjectMustNotBeEmpty } from "./common-refinements.js";

// Map FHIR complex types to Zod schemas

const Element = z.object({
    id: SimpleTypeSchemas.string.optional(),
    extension: z.array(z.any()).optional(),
});

const Attachment: z.Schema = Element.and(
    z.object({
        contentType: SimpleTypeSchemas.code.optional(),
        language: SimpleTypeSchemas.code.optional(),
        data: SimpleTypeSchemas.base64Binary.optional(),
        url: SimpleTypeSchemas.url.optional(),
        size: SimpleTypeSchemas.integer64.optional(),
        hash: SimpleTypeSchemas.base64Binary.optional(),
        title: SimpleTypeSchemas.string.optional(),
        creation: SimpleTypeSchemas.dateTime.optional(),
        height: SimpleTypeSchemas.positiveInt.optional(),
        width: SimpleTypeSchemas.positiveInt.optional(),
        frames: SimpleTypeSchemas.positiveInt.optional(),
        duration: SimpleTypeSchemas.decimal.optional(),
        pages: SimpleTypeSchemas.positiveInt.optional(),
    })
);

const Period: z.Schema = Element.and(
    z.object({
        start: z.string().optional(),
        end: z.string().optional(),
    })
);

const Coding: z.Schema = Element.and(
    z.object({
        system: SimpleTypeSchemas.uri.optional(),
        version: SimpleTypeSchemas.string.optional(),
        code: SimpleTypeSchemas.code.optional(),
        display: SimpleTypeSchemas.string.optional(),
        userSelected: SimpleTypeSchemas.boolean.optional(),
    })
);

const CodeableConcept = Element.and(
    z.object({
        coding: z.array(Coding).min(0).optional(),
        text: SimpleTypeSchemas.string.optional(),
    })
);

const Identifier: z.Schema = Element.and(
    z.object({
        use: z.enum(["usual", "official", "temp", "secondary", "old"]).optional(),
        system: SimpleTypeSchemas.uri.optional(),
        type: CodeableConcept.optional(),
        value: SimpleTypeSchemas.string.optional(),
        assigner: z.object({ reference: SimpleTypeSchemas.string.optional() }).optional(), // note: recursion!
        period: Period.optional(),
    })
);

const Reference = Element.and(
    z.object({
        reference: SimpleTypeSchemas.string.optional(),
        type: SimpleTypeSchemas.uri.optional(),
        display: SimpleTypeSchemas.string.optional(),
        identifier: Identifier.optional(),
    })
).or(z.string().min(1));

const Quantity = Element.and(
    z.object({
        value: SimpleTypeSchemas.decimal.optional(),
        comparator: z.enum(["<", "<=", ">=", ">", "ad"]).optional(),
        unit: SimpleTypeSchemas.string.optional(),
    })
).and(
    z
        .object({
            system: SimpleTypeSchemas.uri,
            code: SimpleTypeSchemas.code,
        })
        .optional()
);

const Age = Quantity.and(
    z.object({
        system: z.literal("http://unitsofmeasure.org"),
        // allowed subset, according to https://build.fhir.org/valueset-age-units.html
        code: z.enum(["a", "mo", "wk", "d", "h", "min"]),
    })
);

const Address = Element.and(
    z.object({
        use: z.enum(["home", "work", "temp", "old", "billing"]).optional(),
        type: z.enum(["postal", "physical", "both"]).optional(),
        text: SimpleTypeSchemas.string.optional(),
        line: z.array(SimpleTypeSchemas.string).optional(),
        city: SimpleTypeSchemas.string.optional(),
        district: SimpleTypeSchemas.string.optional(),
        state: SimpleTypeSchemas.string.optional(),
        postalCode: SimpleTypeSchemas.string.optional(),
        country: SimpleTypeSchemas.string.optional(),
        period: Period.optional(),
    })
);

// circular reference?

const Extension = Element.and(
    z
        .object({
            url: SimpleTypeSchemas.uri,
            valueBase64Binary: SimpleTypeSchemas.base64Binary.optional(),
            valueBoolean: SimpleTypeSchemas.boolean.optional(),
            valueCanonical: SimpleTypeSchemas.canonical.optional(),
            valueCode: SimpleTypeSchemas.code.optional(),
            valueDate: SimpleTypeSchemas.date.optional(),
            valueDateTime: SimpleTypeSchemas.dateTime.optional(),
            valueDecimal: SimpleTypeSchemas.decimal.optional(),
            valueId: SimpleTypeSchemas.id.optional(),
            valueInstant: SimpleTypeSchemas.instant.optional(),
            valueInteger: SimpleTypeSchemas.integer.optional(),
            valueMarkdown: SimpleTypeSchemas.markdown.optional(),
            valueOid: SimpleTypeSchemas.oid.optional(),
            valuePositiveInt: SimpleTypeSchemas.positiveInt.optional(),
            valueString: SimpleTypeSchemas.string.optional(),
            valueTime: SimpleTypeSchemas.time.optional(),
            valueUnsignedInt: SimpleTypeSchemas.unsignedInt.optional(),
            valueUri: SimpleTypeSchemas.uri.optional(),
            valueUrl: SimpleTypeSchemas.url.optional(),
            valueUuid: SimpleTypeSchemas.uuid.optional(),
            valueAddress: Address.optional(),
            valueAge: Age.optional(),
        })
        .superRefine(MustHaveAtMostOneFieldStartingWith("value"))
);

// http://hl7.org/fhir/R4/narrative.html
const Narrative = Element.and(
    z.object({
        status: z.enum(["generated", "extensions", "additional", "empty"]),
        div: SimpleTypeSchemas.string,
    })
);

const ContactPoint = Element.and(
    z.object({
        system: z.enum(["phone", "fax", "email", "pager", "url", "sms", "other"]).optional(),
        value: SimpleTypeSchemas.string.optional(),
        use: z.enum(["home", "work", "temp", "old", "mobile"]).optional(),
        rank: SimpleTypeSchemas.positiveInt.optional(),
        period: Period.optional(),
    })
);

const ContactDetail = Element.and(
    z.object({
        name: SimpleTypeSchemas.string.optional(),
        telecom: z.array(ContactPoint).optional(),
    })
);

const HumanName = Element.and(
    z.object({
        use: z.enum(["usual", "official", "temp", "nickname", "anonymous", "old", "maiden"]).optional(),
        family: SimpleTypeSchemas.string.optional(),
        given: z.array(SimpleTypeSchemas.string).optional(),
        prefix: z.array(SimpleTypeSchemas.string).optional(),
        suffix: z.array(SimpleTypeSchemas.string).optional(),
        period: Period.optional(),
    })
);

const Meta = Element.and(
    z.object({
        versionId: SimpleTypeSchemas.id.optional(),
        lastUpdated: SimpleTypeSchemas.instant.optional(),
        source: SimpleTypeSchemas.uri.optional(),
        profile: z.array(SimpleTypeSchemas.canonical).optional(),
        security: z.array(Coding).optional(),
        tag: z.array(Coding).optional(),
    })
);

const BackboneElement = Element.and(
    z.object({
        modifierExtension: z.array(Extension).optional(),
    })
);

const Resource = z.object({
    id: SimpleTypeSchemas.id.optional(),
    meta: Meta.optional(),
    implicitRules: SimpleTypeSchemas.uri.optional(),
    language: SimpleTypeSchemas.code.optional(),
});

export const ComplexTypeSchemas: Record<string, z.Schema> = {
    Address,
    Age,
    Attachment,
    BackboneElement,
    CodeableConcept,
    Coding,
    ContactDetail,
    ContactPoint,
    Element,
    Extension,
    HumanName,
    Identifier,
    Meta,
    Narrative,
    Period,
    Quantity,
    Reference,
    Resource,
};

Object.keys(ComplexTypeSchemas).forEach((key) => {
    let schema = ComplexTypeSchemas[key];
    schema = schema.superRefine(ObjectMustNotBeEmpty);
    (schema as any).__source = "complex-types.ts";
    ComplexTypeSchemas[key] = schema;
});

export default ComplexTypeSchemas;
