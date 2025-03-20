import { readFileSync } from "fs";

/**
 * Parse a JSON file from the given path.
 *
 * @param filePath The path to the JSON file to parse.
 * @returns The parsed JSON object.
 */
export function parseJsonFromFilePath(filePath: string): object | Array<object> {
    return JSON.parse(readFileSync(filePath, "utf-8"));
}
