import fhirpath from "fhirpath";

import { Appointment, Patient } from "@src/generated/FHIR-r4.js";

const validFinnishSchedulingAppointment = {
    resourceType: "Appointment",
    id: "example-appointment-2",
    status: "booked",
    appointmentType: {
        coding: [
            {
                system: "1.2.246.537.6.884", // required by the Finnish Scheduling IG (https://hl7.fi/fhir/finnish-scheduling/2.0.0-rc1/StructureDefinition-fi-scheduling-appointment.html)
                code: "101",
                display: "Asiakkaan kertakäynti toimipaikassa",
            },
        ],
    },
    start: "2025-02-11T10:00:00Z",
    end: "2025-02-11T10:30:00Z",
    participant: [
        {
            actor: {
                reference: "Patient/PeterPatient",
            },
            status: "accepted",
        },
        {
            actor: {
                reference: "Practitioner/DoctorWho",
            },
            status: "accepted",
        },
    ],
} satisfies Appointment;

const finnishPatient = {
    resourceType: "Patient",
    id: "patient-of-municipality",
    meta: {
        profile: ["https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient"],
    },
    text: {
        status: "generated",
        div: '<div xmlns="http://www.w3.org/1999/xhtml">omitted for brevity</div>',
    },
    extension: [
        {
            url: "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/municipality-code",
            valueCoding: {
                system: "urn:oid:1.2.246.537.6.21.2003",
                code: "020",
                display: "Akaa",
            },
        },
        {
            url: "http://example.org/fhir/StructureDefinition/social-determinants",
            extension: [
                {
                    url: "housing-status",
                    valueCodeableConcept: {
                        coding: [
                            {
                                system: "http://terminology.hl7.org/CodeSystem/housing-status",
                                code: "homeless",
                                display: "Homeless",
                            },
                        ],
                    },
                },
                {
                    url: "food-insecurity",
                    valueBoolean: true,
                },
            ],
        },
    ],
    identifier: [
        {
            use: "official",
            system: "urn:oid:1.2.246.21",
            value: "010190-999Y",
        },
    ],
    active: true,
    name: [
        {
            family: "Henkilö",
            given: ["Testi"],
        },
    ],
    telecom: [
        {
            system: "phone",
            value: "+358401234657",
        },
    ],
    gender: "male",
    birthDate: "1990-01-01",
    address: [
        {
            use: "home",
            line: ["Testikatu 1", "37910 Akaa"],
        },
    ],
    communication: [
        {
            language: {
                coding: [
                    {
                        system: "urn:oid:2.16.840.1.113883.4.642.3.20",
                        code: "fi",
                    },
                ],
            },
        },
    ],
} satisfies Patient;

const evaluateFhirPath = (resource: any, expression: string) => {
    return fhirpath.evaluate(resource, expression, {}, undefined, {
        traceFn: (...msg: any[]) => {},
    });
};

describe("NPM module 'fhirpath'", () => {
    describe('evaluating against a valid Finnish Scheduling "Appointment"', () => {
        const evaluate = (expression: string) => evaluateFhirPath(validFinnishSchedulingAppointment, expression);

        describe('"appointmentType.coding.system"', () => {
            it("should return '1.2.246.537.6.884'", () => {
                expect(evaluate("appointmentType.coding.system")).toEqual(["1.2.246.537.6.884"]);
            });
        });

        describe('"appointmentType.coding.code.exists()"', () => {
            it("should return 'true'", () => {
                expect(evaluate("appointmentType.coding.code.exists()")).toEqual([true]);
            });
        });

        describe('"appointmentType.coding.foobar.exists()"', () => {
            it("should return 'false'", () => {
                expect(evaluate("appointmentType.coding.foobar.exists()")).toEqual([false]);
            });
        });

        describe('"participant.actor.reference"', () => {
            it("should return 'Patient/PeterPatient' and 'Practitioner/DoctorWho'", () => {
                expect(evaluate("participant.actor.reference")).toEqual([
                    "Patient/PeterPatient",
                    "Practitioner/DoctorWho",
                ]);
            });
        });
    });

    describe('evaluating against a valid Finnish "Patient"', () => {
        const evaluate = (expression: string) => evaluateFhirPath(finnishPatient, expression);

        describe('"meta.profile"', () => {
            it("should return 'https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient'", () => {
                expect(evaluate("meta.profile")).toEqual([
                    "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/fi-base-patient",
                ]);
            });
        });

        describe('"extension.url" without a filter', () => {
            it("should return all extension URLs", () => {
                expect(evaluate("extension.url")).toEqual([
                    "https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/municipality-code",
                    "http://example.org/fhir/StructureDefinition/social-determinants",
                ]);
            });
        });

        describe('"extension.url" with a filter', () => {
            it("should return only a subset of extension URLs", () => {
                expect(
                    evaluate(
                        "extension.where(url = 'https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/municipality-code').url"
                    )
                ).toEqual(["https://hl7.fi/fhir/finnish-base-profiles/StructureDefinition/municipality-code"]);
            });
        });

        describe('"extension.exists() != value.exists()"', () => {
            it("should return true", () => {
                expect(evaluate("extension.exists() != value.exists()")).toEqual([true]);
            });
        });

        describe('"extension.exists() implies value.empty()"', () => {
            it("should return true", () => {
                expect(evaluate("extension.exists() implies value.empty()")).toEqual([true]);
            });
        });
    });
});
