## Command

```bash
tiresias init --parent . --workspace-name tiresias-workspace --boards-name boards
```

## Representative output

```text
==> Checking required dependencies for initialization...
✔︎ Success: west found (West version: v1.5.0)
==> Initializing west workspace in /path/to/tiresias-workspace...
==> Cloning tiresias-boards to /path/to/boards...
✔︎ Success: Initialization complete.
==> Next steps:
==> 1. Open your workspace in your editor: /path/to/tiresias-workspace
==> 2. In the NCS extension, add the application if it is not already added.
==> 3. Build with board target: tiresias_dk/nrf5340/cpuapp
```
