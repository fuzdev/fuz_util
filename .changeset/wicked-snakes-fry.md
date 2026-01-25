---
'@fuzdev/fuz_util': major
---

refactor process spawning with `ProcessRegistry` class and improved APIs

breaking changes:

- remove `global_spawn` - use `default_registry.processes` instead
- remove `register_global_spawn` - `ProcessRegistry.spawn()` handles registration automatically
- rename `attach_process_error_handlers` to `attach_process_error_handler` (singular)

new features:

- add `ProcessRegistry` class for testable, isolated process groups
- add `SpawnProcessOptions` with `signal` (AbortSignal) and `timeout_ms`
- add `DespawnOptions` with `signal` and `timeout_ms` (SIGKILL escalation)
- add type guards: `spawn_result_is_error`, `spawn_result_is_signaled`, `spawn_result_is_exited`
- add `running`, `child`, `closed`, and `spawned` getters to `RestartableProcess`
  - `spawned` promise resolves when initial spawn completes (avoids race conditions)
  - concurrent `restart()` calls are coalesced (share one restart operation)
- `spawn_restartable_process` now accepts `SpawnProcessOptions` instead of `SpawnOptions`
- `attach_process_error_handler` returns cleanup function
- `attach_error_handler` throws if called twice on same registry (was silent no-op)

improvements:

- extract `create_closed_promise` to deduplicate event handling in `spawn_process` and `despawn`
- improve JSDoc with usage examples throughout
- validate `timeout_ms` must be non-negative (throws otherwise)
- `attach_error_handler` now uses synchronous SIGKILL cleanup (safe for uncaughtException)
- `print_child_process` handles undefined PID gracefully
