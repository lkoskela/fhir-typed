import { z } from "zod";

import { ISO4217CurrencyCodes } from "./hardcoded/currency-codes.js";
import { AustralianVaccineCodes } from "./hardcoded/australian-vaccine-codes.js";

/**
 * Contribute a set of built-in schemas to the given schema registry using
 * the given callback function.
 *
 * @param assignSchemaForUrlOrName Callback function for registering a new schema.
 */
export function contributeBuiltInSchemas(contribute: (urlOrName: string | string[], schema: z.Schema) => void): void {
    // BCP-13 is a well-known ValueSet that is comprised of RFC 4289
    // (https://www.iana.org/assignments/transfer-encodings/transfer-encodings.xml)
    // and RFC 6838 (https://www.iana.org/assignments/media-types/media-types.xml).
    // The latter is over 2000 listed codes so we'll just check the prefix for now.
    contribute(
        "urn:ietf:bcp:13",
        z.union([
            z.enum(["7bit", "8bit", "binary", "quoted-printable", "base64"]),
            z.string().startsWith("application/"),
            z.string().startsWith("audio/"),
            z.string().startsWith("font/"),
            z.string().startsWith("haptics/"),
            z.string().startsWith("image/"),
            z.string().startsWith("message/"),
            z.string().startsWith("model/"),
            z.string().startsWith("multipart/"),
            z.string().startsWith("text/"),
            z.string().startsWith("video/"),
        ])
    );

    // http://unitsofmeasure.org is a well-known ValueSet that is comprised of
    // UCUM (http://unitsofmeasure.org/ucum.html). That is over 300 listed codes
    // so we'll just accept any non-empty string for now:
    // https://raw.githubusercontent.com/ucum-org/ucum/refs/heads/main/ucum-essence.xml
    contribute("http://unitsofmeasure.org", z.string().min(1));

    // The Ensembl genome data is a well-known ValueSet that is comprised of
    // thousands of values, so we'll accept any non-empty string for now:
    contribute("http://www.ensembl.org", z.string().min(1));

    // The Sequence Ontology (SO) is a collaborative ontology project for the
    // definition of sequence features used in biological sequence annotation.
    // SO was initially developed by the Gene Ontology Consortium. The ontology
    // contains over 2000 terms, so we'll just accept any non-empty string for now:
    contribute("http://www.sequenceontology.org", z.string().min(1));

    // The Human Genome Variation Society (HGVS) is a collaborative effort to
    // standardize nomenclature for human variants. The list and syntax is too
    // difficult to  parse into a schema so we'll just accept any non-empty string
    // for now:
    contribute("http://varnomen.hgvs.org/", z.string().min(1));

    // The National Cancer Institute's NCIthesaurus contains thousands of terms
    // so we'll have to accept any non-empty string.
    contribute("http://ncithesaurus-stage.nci.nih.gov", z.string().min(1));

    // We'll ignore the FDA's "precisionFDA" code systems because they're hidden
    // behind a login wall.
    contribute("https://precision.fda.gov/apps/", z.string().min(1));
    contribute("https://precision.fda.gov/files/", z.string().min(1));
    contribute("https://precision.fda.gov/jobs/", z.string().min(1));

    // The National Library of Medicine's Nucleotide database is a collection of
    // sequences from several sources, including GenBank, RefSeq, TPA and PDB.
    // Genome, gene and transcript sequence data provide the foundation for
    // biomedical research and discovery. However, since none of this is freely
    // available, we'll just accept any non-empty string for now:
    contribute("http://www.ncbi.nlm.nih.gov/nuccore", z.string().min(1));

    // The Sanger Institute's COSMIC project licenses their data under both
    // commercial and non-commercial licenses. We'll just skip validating it for now.
    contribute("http://cancer.sanger.ac.uk/cancergenome/projects/cosmic", z.string().min(1));

    // http://loinc.org is a well-known ValueSet that is comprised of thousands of
    // values, so we'll just check for the rough format of a LOINC code:
    contribute("http://loinc.org", z.string().regex(/^(LP)?\d+\-\d+$/g));

    // The IPD-IMGT/HLA database (https://www.ebi.ac.uk/ipd/imgt/hla/release/)
    // provides details of the publicly available sequences and all sequence
    // changes per release of the database. There are over 40000 codes so we'll
    // just accept any correct-looking code for now:
    contribute("http://www.ebi.ac.uk/ipd/imgt/hla", z.string().regex(/^HLA\d{5}/g));

    // NUCC provider taxonomy codes from https://nucc.org are 10-digit codes and
    // there are over 800 of them, so we'll just check for the format:
    contribute("http://nucc.org/provider-taxonomy", z.string().regex(/^(.){9}X$/g));

    // The IHE format codes (http://ihe.net/fhir/ValueSet/IHE.FormatCode.codesystem)
    // are also quite numerous and we'll just check for the format for now:
    const iheFormatCode = z.string().regex(/^urn:ihe:pcc(:[a-zA-Z0-9\-_]+)+:\d+$/g);
    [
        "http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode",
        "http://ihe.net/fhir/ValueSet/IHE.FormatCode.codesystem",
    ].forEach((url) => contribute(url, iheFormatCode));

    // The ISO 4217 standard specifies currency codes. There are almost 200 of
    // these but they are small values so let's bake them into an enum:
    contribute(
        "urn:iso:std:iso:4217",
        z.enum([ISO4217CurrencyCodes[0], ISO4217CurrencyCodes[1], ...ISO4217CurrencyCodes.slice(2)])
    );

    // The M49 code set defines standard country or area codes for statistical use.
    // https://unstats.un.org/unsd/methodology/m49/
    // Our only known use case so far for this data filters the M49 codes to just
    // regions or subregions, so for now we'll just create a hard-coded enum from
    // those known values.
    // NOTE: Since we're only using a subset of the M49 codes, any other ValueSet
    // that wants a different filtering than "regions and subregions" will need to
    // be handled separately!
    contribute(
        "http://unstats.un.org/unsd/methods/m49/m49.htm",
        z.enum([
            "001", // World
            "002", // Africa
            "005", // South America
            "009", // Oceania
            "011", // Western Africa
            "013", // Central America
            "014", // Eastern Africa
            "015", // Northern Africa
            "017", // Middle Africa
            "018", // Southern Africa
            "019", // Americas
            "021", // Northern America
            "029", // Caribbean
            "030", // Eastern Asia
            "034", // Southern Asia
            "035", // Sout-eastern Asia
            "039", // Southern Europe
            "053", // Australia and New Zealand
            "054", // Melanesia
            "057", // Micronesia
            "061", // Polynesia
            "142", // Asia
            "143", // Central Asia
            "145", // Western Asia
            "150", // Europe
            "151", // Eastern Europe
            "154", // Northern Europe
            "155", // Western Europe
            "202", // Sub-Saharan Africa
            "419", // Latin America and the Caribbean
        ])
    );

    // The 1.2.36.1.2001.1005.17 code set specifies Australian vaccine codes.
    // There are less than 100 of these and they are short strings so let's bake
    // them into an enum:
    contribute(
        "urn:oid:1.2.36.1.2001.1005.17",
        z.enum([AustralianVaccineCodes[0], AustralianVaccineCodes[1], ...AustralianVaccineCodes.slice(2)])
    );

    // Timezones...
    contribute(
        ["https://www.iana.org/time-zones", "http://hl7.org/fhir/ValueSet/timezones"],
        z.union([
            z.string().startsWith("Africa/"),
            z.string().startsWith("America/"),
            z.string().startsWith("Antarctica/"),
            z.string().startsWith("Asia/"),
            z.string().startsWith("Atlantic/"),
            z.string().startsWith("Australia/"),
            z.string().startsWith("Brazil/"),
            z.string().startsWith("Canada/"),
            z.string().startsWith("Chile/"),
            z.string().startsWith("Europe/"),
            z.string().startsWith("Etc/GMT-"),
            z.string().startsWith("Etc/GMT+"),
            z.string().startsWith("Indian/"),
            z.string().startsWith("Pacific/"),
            z.string().startsWith("US/"),
            z.literal("GMT"),
            z.literal("GMT0"),
            z.literal("GMT+0"),
            z.literal("GMT-0"),
            z.literal("CET"),
            z.literal("EET"),
            z.literal("EST"),
            z.literal("HST"),
            z.literal("ROK"),
            z.literal("ROC"),
            z.literal("MET"),
            z.literal("MST"),
            z.literal("MST7MDT"),
            z.literal("Etc/Greenwich"),
            z.literal("Greenwich"),
            z.literal("Etc/UCT"),
            z.literal("Etc/UTC"),
            z.literal("Etc/Universal"),
            z.literal("Universal"),
            z.literal("Etc/Zulu"),
            z.literal("Zulu"),
            z.literal("Etc/GMT"),
            z.literal("Etc/GMT0"),
            z.literal("PST8PDT"),
        ])
    );

    // IETF 3066 language tags are used to identify languages and are specified
    // in https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
    // There are over 9000 valid values there, however, so we'll accept any non-empty string...
    contribute("http://terminology.hl7.org/CodeSystem/ietf3066", z.string().min(1));

    // ICD-10 codes are used for diagnoses and there are too many to enumerate so
    // we'll accept any non-empty string that looks like an ICD-10 code:
    const icd10Schema = z.string().regex(/^[A-Z]\d\d(\.\d{1,3})?(\+[A-Z]\d\d(\.\d{1,3})?)?$/g);
    ["http://hl7.org/fhir/sid/icd-10", "http://terminology.hl7.org/CodeSystem/icd10"].forEach((url) =>
        contribute(url, icd10Schema)
    );
}
