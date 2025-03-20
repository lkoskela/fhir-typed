/**
 * Create a copy of an array with duplicates removed based on their equality.
 *
 * @param arr The array to remove duplicates from.
 * @returns A new array without duplicates.
 */
export function unique<T>(arr: T[]): T[] {
    return uniqueBy(arr, (item) => item);
}

/**
 * Create a copy of an array with duplicates removed based on a property.
 *
 * @param arr The array to remove duplicates from.
 * @param key An identity function to identify duplicates with.
 * @returns A new array without duplicates.
 */
export function uniqueBy<T>(arr: T[], key: (item: T) => any): T[] {
    const seen = new Set<any>();
    const result: T[] = [];
    for (const item of arr) {
        const k = key(item);
        if (seen.has(k)) {
            continue;
        }
        seen.add(k);
        result.push(item);
    }
    return result;
}
