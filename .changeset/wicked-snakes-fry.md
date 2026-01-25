---
'@fuzdev/fuz_util': major
---

refactor process spawning with `ProcessRegistry` class and improved APIs

breaking changes:

- remove `global_spawn` - use `default_registry.processes` instead
- remove `register_global_spawn` - `ProcessRegistry.spawn()` handles registration automatically

new features:

- add `ProcessRegistry` class for testable, isolated process groups
- add `SpawnProcessOptions` with `signal` (AbortSignal) and `timeout_ms`
- add `DespawnOptions` with `signal` and `timeout_ms` (SIGKILL escalation)
- add type guards: `spawn_result_is_error`, `spawn_result_is_signaled`, `spawn_result_is_exited`
- add `running`, `child`, and `closed` getters to `RestartableProcess`
- `attach_process_error_handlers` now returns cleanup function

improvements:

- extract `create_closed_promise` to deduplicate event handling in `spawn_process` and `despawn`
- improve JSDoc with usage examples throughout
