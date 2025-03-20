import { removeDuplicates } from "@src/utils/utils.js";
import { longestKeyFirst } from "@src/schemas/utils/zod-structures.js";

describe("utils", () => {
    describe("longestKeyFirst", () => {
        describe("when keys have same depth", () => {
            it("sorted in alphabetical order", () => {
                expect(["a", "bb"].sort(longestKeyFirst)).toStrictEqual(["a", "bb"]);
                expect(["bb", "a"].sort(longestKeyFirst)).toStrictEqual(["a", "bb"]);
                expect(["b", "aa"].sort(longestKeyFirst)).toStrictEqual(["aa", "b"]);
                expect(["bb.bb", "aa.aa", "cc.cc"].sort(longestKeyFirst)).toStrictEqual(["aa.aa", "bb.bb", "cc.cc"]);
            });
        });

        describe("when keys have different depth", () => {
            it("sorted by depth", () => {
                expect(["b.c", "a.b.c", "d.e.f.g"].sort(longestKeyFirst)).toStrictEqual(["d.e.f.g", "a.b.c", "b.c"]);
                expect(["a.b.c", "d.e.f.g", "b.c"].sort(longestKeyFirst)).toStrictEqual(["d.e.f.g", "a.b.c", "b.c"]);
                expect(["b.c", "a.b.c"].sort(longestKeyFirst)).toStrictEqual(["a.b.c", "b.c"]);
                expect(["a.b.c", "b.c"].sort(longestKeyFirst)).toStrictEqual(["a.b.c", "b.c"]);
            });

            it("sorted by depth, with the exception of top-level keys coming first", () => {
                expect(["a", "b.c", "a.b.c", "d.e.f.g"].sort(longestKeyFirst)).toStrictEqual([
                    "a",
                    "d.e.f.g",
                    "a.b.c",
                    "b.c",
                ]);
                expect(["a.b.c", "b.c", "a", "d.e.f.g"].sort(longestKeyFirst)).toStrictEqual([
                    "a",
                    "d.e.f.g",
                    "a.b.c",
                    "b.c",
                ]);
            });
        });
    });

    describe("removeDuplicates", () => {
        it("with default identity function", () => {
            const actual = removeDuplicates(["a", "b", "a", "c"]);
            expect(actual).toStrictEqual(["a", "b", "c"]);
        });

        it("with custom identity function (uppercase)", () => {
            const actual = removeDuplicates(["a", "b", "A", "c"], (x) => x.toUpperCase());
            expect(actual).toStrictEqual(["a", "b", "c"]);
        });

        it("with custom identity function (JSON.stringify)", () => {
            const john = { age: 10, gender: "male" };
            const jude = { age: 12, gender: "male" };
            const jane = { age: 10, gender: "female" };
            const jill = { age: 10, gender: "female" };
            const actual = removeDuplicates([john, jude, jane, jill], JSON.stringify);
            expect(actual).toStrictEqual([john, jude, jane]);
        });
    });
});
