/**
 * Create a copy of an array with duplicates removed.
 *
 * @param array The array to extraca unique values from.
 * @returns A new array with duplicates removed.
 */
export const unique = <T extends any>(array: T[]): T[] => {
    const hashes: string[] = [];
    const uniques = array.flatMap((obj: any) => {
        const hash = JSON.stringify(obj);
        return !hashes.includes(hash) ? [obj] : [];
    });
    return uniques;
};

/**
 * Create a copy of an array with duplicates removed based on a property.
 *
 * @param array The array to remove duplicates from.
 * @param property The property to remove duplicates from.
 * @returns A new array with duplicates removed.
 */
export const removeDuplicatesByProperty = <T, K extends keyof T>(array: T[], property: K): T[] => {
    const seen = new Set<T[K]>();
    return array.filter((item) => {
        const val = item[property];
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
    });
};

/**
 * Create a copy of an array with duplicates removed based on an identity function.
 *
 * @param array The array to remove duplicates from.
 * @param identityFunction The identity function to remove duplicates from.
 * @returns A new array with duplicates removed.
 */
export const removeDuplicates = <T>(array: T[], identityFunction?: (item: T) => any): T[] => {
    const seen = new Set<any>();
    return array.filter((item) => {
        const val = identityFunction?.(item) || item;
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
    });
};
