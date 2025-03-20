import {
    CodeSystem,
    ConceptMap,
    ElementDefinition,
    ImplementationGuide,
    StructureDefinition,
    StructureMap,
    ValueSet,
} from "@src/generated/FHIR-r4.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { unique } from "@src/utils/arrays.js";
import { ResourceFile } from "../types/index.js";

function dependenciesOfCodeSystem(cs: CodeSystem): string[] {
    // a CodeSystem can have a supplements property that references another CodeSystem
    // and while it doesn't technically extend it by adding any *new* concepts (merely
    // adds properties/metadata to existing concepts), it's still a dependency...
    const deps: string[] = [];
    if (cs.supplements) {
        deps.push(cs.supplements);
    }
    return unique(deps).sort();
}

function dependenciesOfStructureMap(sm: StructureMap): string[] {
    const deps: string[] = [];
    (sm.structure || []).forEach((structure) => deps.push(structure.url));
    (sm.import || []).forEach((canonical) => deps.push(canonical));
    return unique(deps).sort();
}

function dependenciesOfConceptMap(cm: ConceptMap): string[] {
    const deps: string[] = [];
    if (cm.sourceString) {
        // This is the "source[x] in https://hl7.org/fhir/R4/conceptmap.html
        deps.push(cm.sourceString);
    }
    if (cm.targetString) {
        // This is the "target[x] in https://hl7.org/fhir/R4/conceptmap.html
        deps.push(cm.targetString);
    }
    const groups = cm.group || [];
    groups.forEach((group) => {
        if (group.source) {
            deps.push(group.source);
        }
        if (group.target) {
            deps.push(group.target);
        }
        const elements = group.element || [];
        elements.forEach((element) => {
            const targets = element.target || [];
            targets.forEach((target) => {
                const dependsOn = target.dependsOn || [];
                dependsOn.forEach((dep) => {
                    if (dep.system) {
                        deps.push(dep.system);
                    }
                });
            });
        });
    });
    return unique(deps).sort();
}

function dependenciesOfValueSet(vs: ValueSet): string[] {
    // a ValueSet can have a compose property that references other ValueSets
    const deps: string[] = [];
    if (vs.compose?.include) {
        const before = deps.length;
        //console.log(`Extracting dependencies from ValueSet.compose.include...`);
        deps.push(
            ...vs.compose.include.flatMap((element) => element.valueSet || []),
            ...vs.compose.include.flatMap((element) => element.system || [])
        );
        const added = deps.length - before;
        //console.log(`Added ${added} dependencies from ValueSet.compose.include`);
    }
    if (vs.compose?.exclude) {
        const before = deps.length;
        //console.log(`Extracting dependencies from ValueSet.compose.exclude...`);
        deps.push(
            ...vs.compose.exclude.flatMap((element) => element.valueSet || []),
            ...vs.compose.exclude.flatMap((element) => element.system || [])
        );
        const added = deps.length - before;
        //console.log(`Added ${added} dependencies from ValueSet.compose.exclude`);
    }
    return unique(deps).sort();
}

function dependenciesOfStructureDefinition(sd: StructureDefinition): string[] {
    const elements = sd.snapshot?.element || [];
    const deps = elements.flatMap((element: ElementDefinition) => {
        const urls: string[] = [];
        element.type?.forEach((type) => {
            urls.push(type.code);
            if (Array.isArray(type.profile)) {
                urls.push(...type.profile.filter((url) => url !== sd.url));
            }
            if (Array.isArray(type.targetProfile)) {
                urls.push(...type.targetProfile.filter((url) => url !== sd.url));
            }
        });
        element.constraint?.forEach((constraint) => {
            if (constraint.source && constraint.source !== sd.url) {
                urls.push(constraint.source);
            }
        });
        if (element.binding?.strength === "required" && element.binding.valueSet) {
            urls.push(element.binding.valueSet);
        }
        return urls;
    });
    if (sd.baseDefinition) {
        deps.push(sd.baseDefinition);
    }
    const expandStandardTypes = (url: string): string => {
        if (!url.match(/^https?:/)) {
            return `http://hl7.org/fhir/StructureDefinition/${url}`;
        }
        return url;
    };
    return unique(
        deps
            .filter((x) => !!x)
            .filter((x) => x !== sd.url)
            .map(expandStandardTypes)
    ).sort();
}

function dependenciesOfImplementationGuide(ig: ImplementationGuide): string[] {
    const deps: string[] = [];
    (ig.dependsOn || []).forEach((dep) => deps.push(dep.uri));
    (ig.global || []).forEach((dep) => deps.push(dep.profile));
    return unique(deps).sort();
}

export type ResourceObject =
    | ImplementationGuide
    | StructureDefinition
    | ValueSet
    | CodeSystem
    | ConceptMap
    | StructureMap;

export function extractDependenciesFromResource(obj: ResourceObject): string[] {
    if (obj.resourceType === "ImplementationGuide") {
        return dependenciesOfImplementationGuide(obj as ImplementationGuide);
    } else if (obj.resourceType === "StructureDefinition") {
        return dependenciesOfStructureDefinition(obj as StructureDefinition);
    } else if (obj.resourceType === "ValueSet") {
        return dependenciesOfValueSet(obj as ValueSet);
    } else if (obj.resourceType === "CodeSystem") {
        return dependenciesOfCodeSystem(obj as CodeSystem);
    } else if (obj.resourceType === "ConceptMap") {
        return dependenciesOfConceptMap(obj as ConceptMap);
    } else if (obj.resourceType === "StructureMap") {
        return dependenciesOfStructureMap(obj as StructureMap);
    }
    return [];
}

export function extractDependenciesFromResourceFile(file: ResourceFile): string[] {
    const obj = parseJsonFromFilePath(file.filePath) as any;
    //console.log(`Extracting dependencies from ${file.filePath}...`);
    return extractDependenciesFromResource(obj as ResourceObject);
}
