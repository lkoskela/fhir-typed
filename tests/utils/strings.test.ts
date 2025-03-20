import { capitalizeFirstLetter, oxfordCommaList, pluralize } from "@src/utils/strings.js";

describe("String utilities", () => {
    describe("capitalizeFirstLetter", () => {
        it("should capitalize the first letter of a string", () => {
            expect(capitalizeFirstLetter("a")).toBe("A");
            expect(capitalizeFirstLetter("abc")).toBe("Abc");
            expect(capitalizeFirstLetter("Cucumber")).toBe("Cucumber");
            expect(capitalizeFirstLetter("hello world")).toBe("Hello world");
            expect(capitalizeFirstLetter("1, 2, 3, four, five, six")).toBe("1, 2, 3, four, five, six");
        });
    });

    describe("pluralize", () => {
        describe("passing an array as the first argument", () => {
            describe("of zero apples", () => {
                it("should return '0 apples'", () => {
                    expect(pluralize([], "apple")).toBe("0 apples");
                });
            });
            describe("of 1 banana", () => {
                it("should return '1 banana'", () => {
                    expect(pluralize(["foo"], "banana")).toBe("1 banana");
                });
            });
            describe("of 2 cucumbers", () => {
                it("should return '2 cucumbers'", () => {
                    expect(pluralize(["foo", "bar"], "cucumber")).toBe("2 cucumbers");
                });
            });
        });
        describe("passing a number as the first argument", () => {
            describe("of zero apples", () => {
                it("should return '0 apples'", () => {
                    expect(pluralize(0, "apple")).toBe("0 apples");
                });
            });
            describe("of 1 banana", () => {
                it("should return '1 banana'", () => {
                    expect(pluralize(1, "banana")).toBe("1 banana");
                });
            });
            describe("of 2 cucumbers", () => {
                it("should return '2 cucumbers'", () => {
                    expect(pluralize(2, "cucumber")).toBe("2 cucumbers");
                });
            });
        });
        describe("providing the plural form explicitly", () => {
            it("uses the provided plural form when the quantity is not 1", () => {
                expect(pluralize(0, "child", "children")).toBe("0 children");
                expect(pluralize(1, "child", "children")).toBe("1 child");
                expect(pluralize(2, "child", "children")).toBe("2 children");
                expect(pluralize([], "child", "children")).toBe("0 children");
                expect(pluralize([12345], "child", "children")).toBe("1 child");
                expect(pluralize([{}, {}], "child", "children")).toBe("2 children");
            });
        });
        describe("omitting the plural form", () => {
            it("appends an 's' to the singular form when the quantity is not 1", () => {
                expect(pluralize(0, "anchor")).toBe("0 anchors");
                expect(pluralize(1, "bowl")).toBe("1 bowl");
                expect(pluralize(2, "click")).toBe("2 clicks");
                expect(pluralize([], "anchor")).toBe("0 anchors");
                expect(pluralize([{}], "bowl")).toBe("1 bowl");
                expect(pluralize(["one", 2], "click")).toBe("2 clicks");
            });
        });
        describe("omitting the singular form", () => {
            it("defaults to 'item' (and 'items')", () => {
                expect(pluralize(0)).toBe("0 items");
                expect(pluralize(1)).toBe("1 item");
                expect(pluralize(2)).toBe("2 items");
                expect(pluralize([])).toBe("0 items");
                expect(pluralize([1])).toBe("1 item");
                expect(pluralize([1, 2])).toBe("2 items");
            });
        });
    });

    describe("oxfordCommaList", () => {
        it("returns an empty string for an empty list", () => {
            expect(oxfordCommaList([])).toBe("");
        });

        it("returns a single item for a single item list", () => {
            expect(oxfordCommaList(["foo"])).toBe("foo");
        });

        it("returns a list of two items for a two item list", () => {
            expect(oxfordCommaList(["foo", "bar"])).toBe("foo and bar");
        });

        it("returns a list of three items for a three item list", () => {
            expect(oxfordCommaList(["foo", "bar", "baz"])).toBe("foo, bar, and baz");
        });

        it("returns a list of four items for a four item list", () => {
            expect(oxfordCommaList(["foo", "bar", "baz", "fiz"])).toBe("foo, bar, baz, and fiz");
        });

        it("defaults to 'and' as the conjunction", () => {
            expect(oxfordCommaList(["1", "2", "3"])).toBe("1, 2, and 3");
            expect(oxfordCommaList(["1", "2", "3"], "and")).toBe("1, 2, and 3");
        });

        it("uses 'or' as the conjunction when specified", () => {
            expect(oxfordCommaList(["foo", "bar", "baz"], "or")).toBe("foo, bar, or baz");
        });
    });
});
