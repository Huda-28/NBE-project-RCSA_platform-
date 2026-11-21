# Windows startup hotfix

- Backend Python bridge, document extraction, and official XLSX export now select Python using `RCSA_PYTHON_EXECUTABLE`, an active `VIRTUAL_ENV`, the project's `.venv`, or the operating-system default (`python` on Windows / `python3` on Unix).
- Removed the user-requested calculation-engine badge from Header and the Phase 1 architecture notice from the AI Agent UI. Internal engine and AI implementation boundaries remain unchanged.
- Updated `esbuild` to a version compatible with Vite 8 to prevent ERESOLVE.
- The reference data, risk methodology, historical database records, and banking calculations are not changed.

## Windows / PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
python --version
npm.cmd install
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

If the server runs outside the activated environment, configure `RCSA_PYTHON_EXECUTABLE` to point to the correct Python executable. The browser is expected at `http://localhost:3000` unless the terminal displays a different port.

The Python tests can be run with `python -m unittest discover -s tests -p 'test_*.py' -v`. Node/browser integration tests must be run after installing dependencies. The agent is still not implemented; the UI is a preview only.
