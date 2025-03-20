# `fhir-typed`

[Zod](https://zod.dev)-powered runtime validation and type-safety for JSON-based FHIR resources.

## Installation

    npm install fhir-typed

## Usage

In short, using the `fhir-typed` FHIR validator API programmatically involves three steps:

1. Create a validator instance
2. Load packages or local files to validate against
3. Validate the resource against one or more profiles or data types

### Create a validator instance

```typescript
    import { FhirValidator } from 'fhir-typed';

    const validator = new FhirValidator();
```

### Load packages or local files to validate against

```typescript
    // Load some FHIR packages from the public NPM registry:
    await validator.loadPackages("hl7.fhir.r4.core!4.0.1", "hl7.fhir.fi.base");
    await validator.loadPackages("hl7.fhir.se.base!latest");

    // Now, profiles from all three packages should be recognized:
    await Promise.all([
        "http://hl7.org/fhir/StructureDefinition/Patient",
        "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient",
        "http://hl7.org/fhir/uv/ipa/StructureDefinition/ipa-patient"
    ].map((schema) => validator.recognizes(schema))); // => [ true, true, true]
```

### Validate the resource against one or more profiles or data types

With the suitable profiles loaded, we can validate resources against them. By default, the validator will validate the resource against profiles the resource declares conformance to via `meta.profile`:

```typescript
    const resource = {
        resourceType: "Patient",
        meta: {
            profile: ["ttp://hl7.org/fhir/StructureDefinition/Patient"],
        },
        name: [{ use: "official", family: "Smith", given: ["John"] }],
    };

    await validator.validate(resource);
```

The resource to validate can also be passed as a raw JSON string:

```typescript
    const resource = fs.readFileSync(filePath, "utf-8").toString();

    await validator.validate(resource);
```

Or by simply passing the file path to the `validate(resource, options)` method:

```typescript
    await validator.validate("path/to/resource.json");
```

We can also specify which profiles to validate against explicitly, and use the validation options to specify additional validation rules such as instructing the validator to ignore any profiles the resource might self-declare conformance to:

```typescript
    import { ValidateOptions } from 'fhir-typed';

    const options: ValidateOptions = {
        profiles: ["http://hl7.org/fhir/StructureDefinition/patient"],
        ignoreSelfDeclaredProfiles: true,
        ignoreUnknownProfiles: true,
    };

    await validator.validate(resource, options);
```

## License

<div>
<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1" alt="">
<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1" alt="">
<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/nc.svg?ref=chooser-v1" alt="">
<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/nd.svg?ref=chooser-v1" alt=""></a></div>

Licensed under <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/?ref=chooser-v1" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">CC BY-NC-ND 4.0</a>. Dual-licensing for commercial use available upon request.