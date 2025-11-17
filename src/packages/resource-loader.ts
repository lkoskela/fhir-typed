import { basename, join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";

import { globSync } from "glob";
import fpl, { LoadStatus, PackageLoader } from "fhir-package-loader";
import semver from "semver";

import { ResourceFile } from "@src/schemas/types/index.js";

import console from "@src/utils/console.js";
import { sortResourceFilesByDependencies, sortResourceFilesByKind } from "@src/utils/sorting.js";
import { parseJsonFromFilePath } from "@src/utils/filesystem.js";
import { ResourceObject } from "@src/schemas/utils/dependencies.js";
import { unique, uniqueBy } from "@src/utils/arrays.js";

type PackageIdentifier = { name: string; version: string };

type FHIRPackageJson = {
    name: string;
    version: string;
    dependencies: Array<PackageIdentifier>;
    canonical: string;
    url: string;
    fhirVersions: Array<string>;
};

function parsePackageIdentifier(packageName: string): PackageIdentifier {
    const [name, version] = packageName.split("!", 2);
    return { name, version: version || "latest" };
}

async function parsePackageJson(filePath: string): Promise<FHIRPackageJson> {
    const mapDependencies = (input: { [key: string]: string }): PackageIdentifier[] => {
        return Object.entries(input).map((entry: string[]) => ({
            name: entry[0] as string,
            version: entry[1] as string,
        }));
    };
    const packageJson = parseJsonFromFilePath(filePath) as any;
    return Promise.resolve({
        name: packageJson.name,
        version: packageJson.version,
        dependencies: packageJson.dependencies
            ? mapDependencies(packageJson.dependencies as { [key: string]: string })
            : [],
        canonical: packageJson.canonical,
        url: packageJson.url,
        fhirVersions: packageJson.fhirVersions,
    });
}

async function downloadIfNeeded(loader: PackageLoader, pkg: PackageIdentifier): Promise<void> {
    const status = loader.getPackageLoadStatus(pkg.name, pkg.version);
    if (status !== LoadStatus.LOADED) {
        //console.log(`Downloading ${pkg.name}#${pkg.version}`);
        await loader.loadPackage(pkg.name, pkg.version);
    } else {
        //console.log(`${pkg.name}#${pkg.version} has already been loaded.`);
    }
}

function detectResourceFile(filePath: string): ResourceFile | undefined {
    try {
        const resource = JSON.parse(readFileSync(filePath, "utf-8"));
        return {
            filePath,
            resourceType: resource.resourceType,
            kind: resource.kind,
            baseDefinition: resource.baseDefinition,
            url: resource.url,
            name: resource.name,
            date: resource.date,
            status: resource.status,
            experimental: !!resource.experimental,
        };
    } catch (err) {
        console.error(`Error parsing ${filePath}:`, err);
        return undefined;
    }
}

function isResourceFile(file: ResourceFile | undefined): file is ResourceFile {
    return file !== undefined;
}

type DownloadedPackage = {
    packageRootDir: string;
    packageJsonPath?: string;
    files: string[];
};

const CACHE_DIR = ((): string => {
    const filePath = process.env.FHIR_CACHE_DIR || join(homedir(), ".fhir");
    mkdirSync(filePath, { recursive: true });
    return filePath;
})();

async function findDownloadedPackage(pkg: PackageIdentifier): Promise<DownloadedPackage | undefined> {
    const cacheDir = join(CACHE_DIR, "packages");
    if (!existsSync(cacheDir) || !statSync(cacheDir).isDirectory()) {
        return undefined;
    }
    if (pkg.version === "latest") {
        const packageDirs = globSync(`${cacheDir}/*`);
        const packageVersions = packageDirs
            .map((dir) => basename(dir))
            .filter((dir) => dir.startsWith(`${pkg.name}#`))
            .map((dir) => dir.split("#", 2)[1] as string)
            .sort(semver.rcompare);
        if (packageVersions.length > 0) {
            return findDownloadedPackage({ ...pkg, version: packageVersions[0] });
        } else {
            return undefined;
        }
    }
    const packageRootDir = join(cacheDir, key(pkg));
    if (existsSync(packageRootDir) && statSync(packageRootDir).isDirectory()) {
        const filePaths = globSync(`${packageRootDir}/**/*`);
        const packageJsonPath = filePaths.find((filePath) => basename(filePath) === "package.json");
        return {
            packageRootDir,
            packageJsonPath,
            files: filePaths.filter((p) => p !== packageJsonPath),
        };
    }
    return undefined;
}

const relevantResourceTypes = [
    "StructureDefinition",
    "ValueSet",
    "CodeSystem",
    // "ConceptMap",
    // "StructureMap",
    // "ImplementationGuide",
];

function collectResourceFiles(filePaths: string[]): ResourceFile[] {
    return filePaths
        .filter((filePath) => basename(filePath).endsWith(".json"))
        .filter((filePath) => !basename(filePath).endsWith(".openapi.json"))
        .filter((filePath) => basename(filePath) !== "package.json")
        .map(detectResourceFile)
        .filter(isResourceFile)
        .filter((file: ResourceFile) => file.resourceType && relevantResourceTypes.includes(file.resourceType))
        .sort(sortResourceFilesByKind);
}

/**
 * Trim the given list of resource files by removing overlapping definitions
 * that specify the same logical structure.
 *
 * Sometimes there are multiple definitions for the same resource URL, but only
 * some of them are active, older versions succeeded by a newer one, etc.
 *
 * @param resourceFiles
 * @returns
 */
function removeOverlappingDefinitions(resourceFiles: ResourceFile[]): ResourceFile[] {
    function filterNonRetiredOnly(file: EnrichedResourceFile): boolean {
        return file.data.status !== "retired";
    }

    function filterActiveOnly(file: EnrichedResourceFile): boolean {
        return file.data.status === "active";
    }

    function filterNonExperimentalOnly(file: EnrichedResourceFile): boolean {
        return file.data.experimental === false;
    }

    const sortEnrichedFilesMostRecentFirst = (a: EnrichedResourceFile, b: EnrichedResourceFile): number => {
        if (a.data.date && b.data.date) {
            return b.data.date.localeCompare(a.data.date);
        } else {
            return 0;
        }
    };

    type EnrichedResourceFile = {
        file: ResourceFile;
        data: ResourceObject;
    };

    type EnrichedResourceFileFilter = (file: EnrichedResourceFile) => boolean;

    const uniqueUrls = unique(resourceFiles.map((file) => file.url));
    const trimmedResourceFiles = uniqueUrls.flatMap((url) => {
        const overlappingFiles = resourceFiles.filter((file) => file.url === url);
        if (overlappingFiles.length === 1) {
            // If there's no overlap, just return the one-file array
            return overlappingFiles;
        }

        // If there are multiple files with the same URL, we'll need to
        // pick one of them to process. We'll first see if there is only one active
        // file, and if so, we'll use that one, ignoring those marked as draft.

        let enrichedFiles = overlappingFiles.map((file: ResourceFile) => {
            return {
                file,
                data: parseJsonFromFilePath(file.filePath) as ResourceObject,
            } satisfies EnrichedResourceFile;
        });

        function filterEnrichedFiles(
            files: EnrichedResourceFile[],
            ...filterFunctions: EnrichedResourceFileFilter[]
        ): EnrichedResourceFile[] {
            if (files.length > 1) {
                const filterFunction = filterFunctions[0];
                const subset = enrichedFiles.filter(filterFunction);
                if (subset.length === enrichedFiles.length) {
                    if (filterFunctions.length > 1) {
                        return filterEnrichedFiles(subset, ...filterFunctions.slice(1));
                    }
                } else if (subset.length === 1) {
                    return subset.slice(0, 1);
                } else if (subset.length > 1) {
                    if (filterFunctions.length > 1) {
                        return filterEnrichedFiles(subset, ...filterFunctions.slice(1));
                    }
                }
            }
            return files;
        }

        enrichedFiles = filterEnrichedFiles(
            enrichedFiles,
            filterActiveOnly,
            filterNonRetiredOnly,
            filterNonExperimentalOnly
        );

        if (enrichedFiles.length === 1) {
            return enrichedFiles[0].file;
        } else {
            enrichedFiles = enrichedFiles.sort(sortEnrichedFilesMostRecentFirst);
            return enrichedFiles[0].file;
        }
    });

    return trimmedResourceFiles;
}

/**
 * Load all FHIR resources for a given package and its dependencies.
 *
 * @param loader PackageLoader
 * @param pkg the name and version of the package to load
 * @returns a list of resource files to process related to the package, including its dependencies.
 */
async function loadResources(loader: PackageLoader, ...pkgs: PackageIdentifier[]): Promise<Array<ResourceFile>> {
    const resourceFiles: ResourceFile[] = [];
    for (let pkg of pkgs) {
        const batch = await loadResourcesForPackage(loader, pkg);
        for (let resourceFile of batch) {
            if (!resourceFiles.some((file) => file.filePath === resourceFile.filePath)) {
                resourceFiles.push(resourceFile);
            }
        }
    }
    return resourceFiles;
}

/**
 * Load all FHIR resources for a given package and its dependencies.
 *
 * @param loader PackageLoader
 * @param pkg the name and version of the package to load
 * @returns a list of resource files to process related to the package, including its dependencies.
 */
async function loadResourcesForPackage(loader: PackageLoader, pkg: PackageIdentifier): Promise<Array<ResourceFile>> {
    //console.log(`Loading resources for ${key(pkg)}`);

    async function recurse(
        loader: PackageLoader,
        pkg: PackageIdentifier,
        processedPackages: Array<string>
    ): Promise<Array<ResourceFile>> {
        // First, make sure that we've loaded the requested FHIR package to
        // the local FHIR cache (usually under the user's home directory):
        await downloadIfNeeded(loader, pkg);

        const dpkg = await findDownloadedPackage(pkg);
        if (!dpkg) {
            return Promise.reject(`Could not find package ${key(pkg)}`);
        }

        let resourceFilesFromDeps: ResourceFile[] = [];
        if (dpkg.packageJsonPath) {
            const packageJson = await parsePackageJson(dpkg.packageJsonPath);
            //console.log(`Processing dependencies: `, packageJson.dependencies);
            resourceFilesFromDeps = (
                await Promise.all(
                    packageJson.dependencies.map(async (dep: PackageIdentifier) => {
                        const dependencyKey = key(dep);
                        if (!processedPackages.includes(dependencyKey)) {
                            //console.log(`Loading dependency of ${pkg.name}: ${dep.name}`);
                            processedPackages.push(dependencyKey);
                            return await recurse(loader, dep, processedPackages);
                        } else {
                            return [];
                        }
                    })
                )
            ).flat();
        }
        const resourceFiles = collectResourceFiles(dpkg.files);
        return [...resourceFilesFromDeps, ...resourceFiles];
    }

    return (await recurse(loader, pkg, [])).sort(sortResourceFilesByKind);
}

function key(pkg: PackageIdentifier): string {
    return pkg.name + "#" + pkg.version;
}

export interface ResourceLoader {
    getResourceFiles(): Promise<ResourceFile[]>;
    loadPackages(...identifiers: string[]): Promise<Array<ResourceFile>>;
    loadFiles(...filePaths: string[]): Promise<Array<ResourceFile>>;
}

export class DefaultResourceLoader implements ResourceLoader {
    private loader: Promise<fpl.BasePackageLoader>;
    private resourceFiles: Promise<ResourceFile[]> = Promise.resolve([]);

    constructor() {
        this.loader = fpl.defaultPackageLoader({});
    }

    async getResourceFiles(): Promise<ResourceFile[]> {
        return await this.resourceFiles;
    }

    async loadFiles(...filePaths: string[]): Promise<Array<ResourceFile>> {
        await this.loader;
        this.resourceFiles = this.resourceFiles.then(async (oldResourceFiles) => {
            const newResourceFiles = collectResourceFiles(filePaths);
            return sortResourceFiles([...oldResourceFiles, ...newResourceFiles]);
        });
        return await this.getResourceFiles();
    }

    async loadPackages(...identifiers: string[]): Promise<Array<ResourceFile>> {
        const packageIdentifiers = identifiers.map(parsePackageIdentifier);
        const loader = await this.loader;
        this.resourceFiles = this.resourceFiles.then(async (oldResourceFiles) => {
            const newResourceFiles = await loadResources(loader, ...packageIdentifiers);
            return sortResourceFiles([...oldResourceFiles, ...newResourceFiles]);
        });
        return await this.getResourceFiles();
    }
}

function sortResourceFiles(combinedFiles: ResourceFile[]): ResourceFile[] {
    const kindSortedFiles = uniqueBy(combinedFiles, (f) => f.filePath).sort(sortResourceFilesByKind);
    return kindSortedFiles.sort(sortResourceFilesByDependencies(kindSortedFiles));
}
