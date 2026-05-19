/**
 * Generic concurrent DAG executor.
 *
 * Executes nodes in a dependency graph with configurable concurrency,
 * failure handling, and skip semantics. Nodes without dependency edges
 * run in parallel (up to max_concurrency). Dependencies are respected
 * via per-node deferreds.
 *
 * @module
 */

import {AsyncSemaphore, create_deferred, type Deferred} from './async.js';
import {topological_sort, type Sortable} from './sort.js';

/**
 * Minimum shape for a DAG node.
 */
export interface DagNode extends Sortable {
	id: string;
	depends_on?: Array<string>;
}

/**
 * Options for running a DAG.
 */
export interface DagOptions<T extends DagNode> {
	/** Nodes to execute. */
	nodes: Array<T>;
	/** Execute a node. Throw on failure. */
	execute: (node: T) => Promise<void>;
	/** Called after a node fails. For observability — the error is already recorded. */
	on_error?: (node: T, error: Error) => Promise<void>;
	/** Called when a node is skipped (pre-skip or dependency failure). */
	on_skip?: (node: T, reason: string) => Promise<void>;
	/** Return true to skip a node without executing. Dependents still proceed. */
	should_skip?: (node: T) => boolean;
	/** Maximum concurrent executions. Default: Infinity. */
	max_concurrency?: number;
	/** Stop starting new nodes on first failure. Default: true. */
	stop_on_failure?: boolean;
	/** Skip internal graph validation (caller already validated). */
	skip_validation?: boolean;
}

/**
 * Result for a single node.
 */
export interface DagNodeResult {
	id: string;
	status: 'completed' | 'failed' | 'skipped';
	error?: string;
	duration_ms: number;
}

/**
 * Result of a DAG execution.
 */
export interface DagResult {
	/** Whether all executed nodes succeeded. */
	success: boolean;
	/** Per-node results. */
	results: Map<string, DagNodeResult>;
	/** Number of nodes that completed successfully. */
	completed: number;
	/** Number of nodes that failed. */
	failed: number;
	/** Number of nodes that were skipped. */
	skipped: number;
	/** Total execution time in milliseconds. */
	duration_ms: number;
	/** Error message if any nodes failed. */
	error?: string;
}

/**
 * Execute nodes in a dependency graph concurrently.
 *
 * Independent nodes (no unmet dependencies) run in parallel up to
 * `max_concurrency`. When a node completes, its dependents become
 * eligible to start. Failure cascading and stop-on-failure are handled
 * per the options.
 *
 * @param options - DAG execution options
 * @returns aggregated result with per-node details
 */
export const run_dag = async <T extends DagNode>(options: DagOptions<T>): Promise<DagResult> => {
	const {
		nodes,
		execute,
		on_error,
		on_skip,
		should_skip,
		max_concurrency = Infinity,
		stop_on_failure = true,
		skip_validation = false,
	} = options;

	const start_time = Date.now();

	// Empty graph
	if (nodes.length === 0) {
		return {
			success: true,
			results: new Map(),
			completed: 0,
			failed: 0,
			skipped: 0,
			duration_ms: 0,
		};
	}

	// Validate graph (cycle detection, duplicate IDs, missing deps)
	if (!skip_validation) {
		const sort_result = topological_sort(nodes, 'node');
		if (!sort_result.ok) {
			return {
				success: false,
				results: new Map(),
				completed: 0,
				failed: 0,
				skipped: 0,
				duration_ms: Date.now() - start_time,
				error: sort_result.error,
			};
		}
	}

	// Build deferreds and tracking maps
	const deferreds: Map<string, Deferred<void>> = new Map();
	const outcomes: Map<string, 'ok' | 'fail'> = new Map();
	const results: Map<string, DagNodeResult> = new Map();

	for (const node of nodes) {
		deferreds.set(node.id, create_deferred());
	}

	let stopping = false;
	const semaphore = new AsyncSemaphore(max_concurrency);

	// Skip a node, record outcome, notify dependents
	const skip_node = async (node: T, outcome: 'ok' | 'fail', reason: string): Promise<void> => {
		outcomes.set(node.id, outcome);
		results.set(node.id, {id: node.id, status: 'skipped', duration_ms: 0});
		if (on_skip) await on_skip(node, reason);
		deferreds.get(node.id)!.resolve();
	};

	// Per-node async task
	const run_node = async (node: T): Promise<void> => {
		const deps = node.depends_on ?? [];

		// Wait for all dependencies to resolve
		if (deps.length > 0) {
			await Promise.all(deps.map((d) => deferreds.get(d)!.promise));
		}

		// Pre-skip check (e.g., pipeline step.skip or change.action === 'skip')
		if (should_skip?.(node)) {
			return skip_node(node, 'ok', 'pre-skipped');
		}

		// Check if any dependency failed — skip this node too
		if (deps.some((d) => outcomes.get(d) === 'fail')) {
			return skip_node(node, 'fail', 'dependency failed');
		}

		// Check if we're stopping (some other node failed with stop_on_failure)
		if (stopping) {
			return skip_node(node, 'fail', 'stopped');
		}

		// Acquire concurrency slot
		await semaphore.acquire();

		// Double-check stopping after acquiring slot

		if (stopping) {
			semaphore.release();
			return skip_node(node, 'fail', 'stopped');
		}

		// Execute
		const exec_start = Date.now();
		try {
			await execute(node);
			outcomes.set(node.id, 'ok');
			results.set(node.id, {
				id: node.id,
				status: 'completed',
				duration_ms: Date.now() - exec_start,
			});
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			outcomes.set(node.id, 'fail');
			results.set(node.id, {
				id: node.id,
				status: 'failed',
				error: error.message,
				duration_ms: Date.now() - exec_start,
			});
			if (stop_on_failure) stopping = true;
			if (on_error) await on_error(node, error);
		} finally {
			semaphore.release();
			deferreds.get(node.id)!.resolve();
		}
	};

	// Launch all nodes — they naturally wait for their deps via deferreds
	await Promise.all(nodes.map(run_node));

	// Aggregate results
	let completed = 0;
	let failed = 0;
	let skipped = 0;
	for (const result of results.values()) {
		switch (result.status) {
			case 'completed':
				completed++;
				break;
			case 'failed':
				failed++;
				break;
			case 'skipped':
				skipped++;
				break;
		}
	}

	const success = failed === 0;
	return {
		success,
		results,
		completed,
		failed,
		skipped,
		duration_ms: Date.now() - start_time,
		error: success ? undefined : `${failed} node(s) failed`,
	};
};
