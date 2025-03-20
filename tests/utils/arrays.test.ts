import { unique, uniqueBy } from "@src/utils/arrays.js";

describe("utils", () => {
    describe("arrays", () => {
        describe("unique", () => {
            it("should remove duplicates", () => {
                expect(unique([1, 2, 2, 3])).toStrictEqual([1, 2, 3]);
                expect(unique(["1", "two", 3, "two", "TWO"])).toStrictEqual(["1", "two", 3, "TWO"]);
            });
        });
        describe("uniqueBy", () => {
            it("should remove duplicates", () => {
                const bobby = { firstName: "Bob", lastName: "Jones" };
                const jimmy = { firstName: "Jim", lastName: "Jones" };
                const paddy = { firstName: "Patrick", lastName: "Smith" };
                const pat = { firstName: "Patrick", lastName: "Mahoney" };
                expect(uniqueBy([bobby, jimmy, paddy, pat], (x) => x.firstName)).toStrictEqual([bobby, jimmy, paddy]);
                expect(uniqueBy([bobby, jimmy, paddy, pat], (x) => x.lastName)).toStrictEqual([bobby, paddy, pat]);
            });
        });
    });
});
