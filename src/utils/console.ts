const prefixLogFn = (original: (...args: any[]) => void, prefix: string): ((...args: any[]) => void) => {
    return (...args: any[]) => original(prefix, ...args);
};
// console.trace = prefixLogFn(console.trace, '\u2611 ');
// console.log = prefixLogFn(console.log, '\u270F\uFE0F ');
// console.info = prefixLogFn(console.info, '\u270F\uFE0F ');
console.warn = prefixLogFn(console.warn, "\u26A0\uFE0F ");
console.error = prefixLogFn(console.error, "\u274C ");

export default console;
