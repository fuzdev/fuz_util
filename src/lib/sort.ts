/**
 * Generic topological sort using Kahn's algorithm.
 *
 * Orders items so that dependencies come before dependents.
 * Works with any item type that has `id` and optional `depends_on`.
 *
 * @module
 */

/**
 * Minimum shape required for topological sorting.
 */
export interface Sortable {
	id: string;
	depends_on?: Array<string>;
}

/**
 * Result of topological sort.
 */
export type TopologicalSortResult<T extends Sortable> =
	{ ok: true; sorted: Array<T> } | { ok: false; error: string; cycle?: Array<string> };

/**
 * Sort items by their dependencies using Kahn's algorithm.
 *
 * Returns items ordered so that dependencies come before dependents.
 * If a cycle is detected, returns an error with the cycle path.
 *
 * @param items - array of items to sort
 * @param label - label for error messages (e.g. "resource", "step")
 * @returns sorted items or error if cycle detected
 */
export const topological_sort = <T extends Sortable>(
	items: Array<T>,
	label: string = 'item'
): TopologicalSortResult<T> => {
	// Build id -> item map
	const item_map: Map<string, T> = new Map();
	for (const item of items) {
		if (item_map.has(item.id)) {
			return { ok: false, error: `duplicate ${label} id: ${item.id}` };
		}
		item_map.set(item.id, item);
	}

	// Validate all dependencies exist and count dependents per item
	// dependents_count[X] = how many items list X in their depends_on
	const dependents_count: Map<string, number> = new Map();
	for (const item of items) {
		dependents_count.set(item.id, 0);
	}
	for (const item of items) {
		const deps = item.depends_on ?? [];
		for (const dep of deps) {
			if (!item_map.has(dep)) {
				return { ok: false, error: `${label} "${item.id}" depends on unknown ${label} "${dep}"` };
			}
			dependents_count.set(dep, dependents_count.get(dep)! + 1);
		}
	}

	// Start from leaf items (nothing depends on them), work toward roots
	const queue: Array<string> = [];
	for (const [id, count] of dependents_count) {
		if (count === 0) {
			queue.push(id);
		}
	}

	// Process leaves first, then items whose dependents are all processed
	const sorted: Array<T> = [];
	const visited: Set<string> = new Set();

	while (queue.length > 0) {
		const id = queue.shift()!;
		if (visited.has(id)) continue;
		visited.add(id);

		sorted.push(item_map.get(id)!);

		// This item is processed — decrement its dependencies' dependent counts
		const deps = item_map.get(id)!.depends_on ?? [];
		for (const dep of deps) {
			const new_count = dependents_count.get(dep)! - 1;
			dependents_count.set(dep, new_count);
			if (new_count === 0) {
				queue.push(dep);
			}
		}
	}

	// Check for cycle
	if (sorted.length !== items.length) {
		const unvisited = items.filter((item) => !visited.has(item.id)).map((item) => item.id);
		const cycle = find_cycle(item_map, unvisited);
		return {
			ok: false,
			error: `dependency cycle detected: ${cycle.join(' -> ')}`,
			cycle
		};
	}

	// Reverse: leaves were processed first, but dependencies must come first in output
	sorted.reverse();

	return { ok: true, sorted };
};

/**
 * Find a cycle in the dependency graph starting from unvisited nodes.
 * Used for error reporting when a cycle is detected.
 */
const find_cycle = <T extends Sortable>(
	item_map: Map<string, T>,
	unvisited: Array<string>
): Array<string> => {
	const unvisited_set = new Set(unvisited);

	// DFS to find cycle
	const path: Array<string> = [];
	const in_path: Set<string> = new Set();

	const dfs = (id: string): boolean => {
		if (in_path.has(id)) {
			path.push(id);
			return true;
		}
		if (!unvisited_set.has(id)) return false;

		in_path.add(id);
		path.push(id);

		const item = item_map.get(id);
		const deps = item?.depends_on ?? [];
		for (const dep of deps) {
			if (dfs(dep)) return true;
		}

		in_path.delete(id);
		path.pop();
		return false;
	};

	if (unvisited.length > 0) {
		dfs(unvisited[0]!);
	}

	// Extract just the cycle portion
	if (path.length > 0) {
		const last = path[path.length - 1]!;
		const cycle_start = path.indexOf(last);
		if (cycle_start < path.length - 1) {
			return path.slice(cycle_start);
		}
	}

	return unvisited;
};
