---
'@fuzdev/fuz_util': minor
---

refactor process spawning with `ProcessRegistry` class and improved APIs

breaking changes:

- remove `global_spawn` - use `default_registry.processes` instead
- remove `register_global_spawn` - `ProcessRegistry.spawn()` handles registration automatically
- rename `attach_process_error_handlers` to `attach_process_error_handler` (singular)
- rename `RestartableProcess.running` to `active` (reflects handle state, not OS process state)
- `spawn_out` returns `''` for empty output instead of `null` (null only for spawn failures)

new features:

- add `ProcessRegistry` class for testable, isolated process groups
- add `SpawnProcessOptions` with `signal` (AbortSignal) and `timeout_ms`
- add `DespawnOptions` with `signal` and `timeout_ms` (SIGKILL escalation)
- add type guards: `spawn_result_is_error`, `spawn_result_is_signaled`, `spawn_result_is_exited`
- add `active`, `child`, `closed`, and `spawned` getters to `RestartableProcess`
  - `spawned` promise resolves when initial spawn completes (avoids race conditions)
  - concurrent `restart()` and `kill()` calls are coalesced
- `spawn_restartable_process` now accepts `SpawnProcessOptions` instead of `SpawnOptions`
- `attach_process_error_handler` now takes options object instead of positional args
- `attach_error_handler` throws if called twice on same registry (was silent no-op)
- `attach_error_handler` accepts `graceful_timeout_ms` option for SIGTERM before SIGKILL

improvements:

- fix race condition between concurrent `kill()` and `restart()` calls
- `process_is_pid_running` rejects fractional PIDs
- `spawn_out` explicitly cleans up stream listeners
- improve JSDoc with usage examples throughout
