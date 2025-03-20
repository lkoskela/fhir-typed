/**
 * Capitalize the first letter of a string.
 *
 * @param s The string to capitalize.
 * @returns A new string with the first letter capitalized.
 */
export function capitalizeFirstLetter(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Produce a pluralized string from a quantity and a singular or pluralized word.
 *
 * @param quantity `number` or an array of anything
 * @param singular The singular version of the word (e.g. "apple" or "child")
 * @param pluralized (Optional) the plural version of the word, e.g. "apples" or "children".
 *                   If omitted, we'll simply append an "s" to the singular word and hope for the best.
 * @returns A string with the quantity and the pluralized word, e.g. "1 apple", "2 apples", or "3 children".
 */
export function pluralize(quantity: number | any[], singular?: string, pluralized?: string): string {
    const count = Array.isArray(quantity) ? quantity.length : quantity;
    if (count === 1) {
        return `${count} ${singular || "item"}`;
    } else {
        return `${count} ${pluralized || (singular || "item") + "s"}`;
    }
}

/**
 * Produce a string from a list of strings, using the Oxford comma.
 *
 * @param list The list of strings to join.
 * @param conjunction The conjunction to use, e.g. `"and"` or `"or"` (default: `"and"`)
 * @returns A string with the list of strings, using the Oxford comma.
 */
export function oxfordCommaList(list: string[], conjunction: "and" | "or" = "and"): string {
    if (list.length === 0) {
        return "";
    }
    if (list.length === 1) {
        return list[0];
    }
    if (list.length === 2) {
        return list.join(` ${conjunction} `);
    }
    return `${list.slice(0, -1).join(", ")}, ${conjunction} ${list.slice(-1)}`;
}
