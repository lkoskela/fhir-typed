/**
 * Produce a topologically sorted array of nodes from a dependency map.
 *
 * @param dependencyMap The dependency map
 * @returns A "tuple" of a sorted list of keys and detected cycles.
 */
export function topologicalSortWithTransitiveResolution(dependencyMap: Record<string, string[]>): {
    sorted: string[];
    cycles: string[][];
} {
    const sorted: string[] = [];
    const cycles: string[][] = [];
    const visited = new Set<string>(); // Tracks fully processed nodes
    const visiting = new Set<string>(); // Tracks nodes in the current DFS path (for cycle detection)

    function dfs(node: string, path: string[]): boolean {
        if (visited.has(node)) return false; // Already processed
        if (visiting.has(node)) {
            // Cycle detected: extract the cycle
            const cycleStart = path.indexOf(node);
            //console.log(`Cycle detected at path index ${path.indexOf(node)}: ${path.slice(cycleStart).join(" -> ")} -> ${node}`);
            cycles.push(path);
            //cycles.push(path.slice(cycleStart));
            return true;
        }

        // Mark node as being visited in the current path
        visiting.add(node);
        path.push(node);

        for (const neighbor of dependencyMap[node] || []) {
            if (dfs(neighbor, path)) {
                return true; // Stop on first cycle detection
            }
        }

        // Mark node as fully processed
        visiting.delete(node);
        visited.add(node);
        sorted.push(node); // Append to result *after* all dependencies

        path.pop();
        return false;
    }

    // Process each node
    for (const node of Object.keys(dependencyMap)) {
        if (!visited.has(node)) {
            dfs(node, []);
        }
    }

    return { sorted: sorted.reverse(), cycles }; // Reverse to get correct order
}

/**
 * Topologically sort a dependency map and detect cycles.
 *
 * @param dependencyMap The dependency map
 * @returns A "tuple" of a sorted list of keys and detected cycles.
 */
export function topologicalSortWithCycleDetection(dependencyMap: Record<string, string[]>): {
    sorted: string[];
    cycles: string[][];
} {
    const inDegree: Record<string, number> = {};
    const graph: Record<string, string[]> = {};
    const result: string[] = [];
    const cycles: string[][] = [];

    // Initialize in-degree and graph
    for (const key of Object.keys(dependencyMap)) {
        if (!(key in inDegree)) inDegree[key] = 0;
        graph[key] = dependencyMap[key];

        for (const dep of dependencyMap[key]) {
            if (!(dep in inDegree)) inDegree[dep] = 0;
            inDegree[dep]++;
        }
    }

    // Find nodes with zero in-degree
    const queue: string[] = Object.keys(inDegree).filter((key) => inDegree[key] === 0);

    // Track visited nodes
    const visited = new Set<string>();

    while (queue.length > 0) {
        const node = queue.shift()!;
        result.push(node);
        visited.add(node);

        for (const neighbor of graph[node] || []) {
            inDegree[neighbor]--;
            if (inDegree[neighbor] === 0) {
                queue.push(neighbor);
            }
        }
    }

    // Detect cycles: Nodes still having in-degree > 0 are part of a cycle
    const remainingNodes = Object.keys(inDegree).filter((key) => inDegree[key] > 0);

    if (remainingNodes.length > 0) {
        // Find strongly connected components (SCCs) as cycles
        const visitedCycleNodes = new Set<string>();
        for (const node of remainingNodes) {
            if (!visitedCycleNodes.has(node)) {
                const cycle = findCycle(node, dependencyMap, visitedCycleNodes);
                if (cycle.length > 0) cycles.push(cycle);
            }
        }
    }

    return { sorted: result, cycles };
}

/**
 * Finds a cycle using DFS.
 */
function findCycle(start: string, dependencyMap: Record<string, string[]>, visited: Set<string>): string[] {
    const stack: string[] = [];
    const path = new Set<string>();

    function dfs(node: string): string[] | null {
        if (path.has(node)) {
            // Cycle detected, extract cycle path
            const cycleStart = stack.indexOf(node);
            return stack.slice(cycleStart);
        }
        if (visited.has(node)) return null;

        visited.add(node);
        path.add(node);
        stack.push(node);

        for (const neighbor of dependencyMap[node] || []) {
            const cycle = dfs(neighbor);
            if (cycle) return cycle;
        }

        stack.pop();
        path.delete(node);
        return null;
    }

    return dfs(start) || [];
}
