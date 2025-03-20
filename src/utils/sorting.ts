import { ResourceFile } from "@src/schemas/types/index.js";
import { extractDependenciesFromResourceFile } from "../schemas/utils/dependencies.js";
import { topologicalSortWithTransitiveResolution } from "./topological-sort.js";
import { unique } from "./arrays.js";

/**
 * A sorting function that sorts resource files by their dependencies.
 *
 * - Returns a negative number if a should come before b.
 * - Returns a positive number if a should come after b.
 * - Returns zero if a and b are considered equal from a dependency POV.
 */
type SortFn = (a: ResourceFile, b: ResourceFile) => number;

/**
 * Configure a sorting function that sorts resource files by their dependencies,
 * according to the dependency map built from the given set of known resource files.
 *
 * @param resourceFiles The resource files to build the dependency map from.
 * @returns a sorting function that sorts resource files by their dependencies.
 */
export function sortResourceFilesByDependencies(resourceFiles: ResourceFile[]): SortFn {
    // Build an in-memory dependency map of all resources:
    const dependencyMap: Record<string, string[]> = {};
    resourceFiles.forEach((file) => {
        const newDeps: string[] = extractDependenciesFromResourceFile(file);
        // If the dependencyMap already has an entry for this URL, we could either
        // warn the user, silently merge the two lists, or overwrite the existing entry.
        // For now, we'll silently merge the two lists.
        const oldDeps = dependencyMap[file.url] || [];
        dependencyMap[file.url] = unique([...oldDeps, ...newDeps]);
    });

    const { sorted, cycles } = topologicalSortWithTransitiveResolution(dependencyMap);

    /**
     * Return negative if a should come before b.
     * Return positive if a should come after b.
     * Return zero if a and b are equal.
     */
    return (a: ResourceFile, b: ResourceFile): number => {
        const aIndex = sorted.indexOf(a.url);
        const bIndex = sorted.indexOf(b.url);
        if (aIndex > -1 && bIndex > -1) {
            // if both are in the sorted list, compare their indices to return the correct order
            return bIndex - aIndex;
        } else if (aIndex > -1) {
            // If only a is in the sorted list, b might be a's dependency and therefore should come before
            return 1;
        } else if (bIndex > -1) {
            // If only b is in the sorted list, a might be b's dependency and therefore should come before
            return -1;
        } else {
            // If neither is in the sorted list, compare their URLs to return the correct order
            return a.url.localeCompare(b.url);
        }
    };
}

/**
 * Sort `ResourceFile` objects by their kind. For example, a `ValueSet` should
 * always come before a `StructureDefinition` because a `StructureDefinition`
 * might reference a `ValueSet` but never the other way around.
 *
 * @param a The first resource file to compare.
 * @param b The second resource file to compare.
 * @returns A negative number if a should come before b, a positive number if
 *          a should come after b, or zero if a and b are equal.
 */
export function sortResourceFilesByKind(a: ResourceFile, b: ResourceFile): number {
    if (!a.resourceType && !b.resourceType) {
        return 0;
    } else if (a.resourceType && !b.resourceType) {
        return -1;
    } else if (!a.resourceType && b.resourceType) {
        return 1;
    }
    const resourceTypeOrder = ["ImplementationGuide", "StructureDefinition", "ValueSet", "CodeSystem", "ConceptMap"];
    const kindOrder = ["resource", "complex-type", "primitive"];

    const comparisons: Array<(a: ResourceFile, b: ResourceFile) => number> = [
        (a, b) => resourceTypeOrder.indexOf(b.resourceType) - resourceTypeOrder.indexOf(a.resourceType),
        (a, b) => {
            if (a.kind && b.kind) {
                return kindOrder.indexOf(b.kind) - kindOrder.indexOf(a.kind);
            } else if (a.kind) {
                return -1;
            } else if (b.kind) {
                return 1;
            } else {
                return 0;
            }
        },
        (a, b) => {
            if (a.name && b.name) {
                return a.name.localeCompare(b.name);
            } else if (a.name) {
                return -1;
            } else if (b.name) {
                return 1;
            } else {
                return 0;
            }
        },
        (a, b) => a.url.localeCompare(b.url),
    ];
    for (const compare of comparisons) {
        const result = compare(a, b);
        if (result !== 0) {
            return result;
        }
    }
    return 0;
}
