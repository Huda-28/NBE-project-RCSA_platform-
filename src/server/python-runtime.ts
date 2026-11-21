import fs from 'fs';
import path from 'path';

/**
 * Find the Python used by the active project virtual environment.
 * On Windows `python3` is frequently missing even when `python` works.
 * Respect an explicit override for servers and never silently change the RCSA engine.
 */
export function getPythonExecutable(): string {
  const configured = process.env.RCSA_PYTHON_EXECUTABLE?.trim();
  if (configured) return configured;

  const envRoot = process.env.VIRTUAL_ENV?.trim();
  if (envRoot) {
    const executable = path.join(envRoot, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (fs.existsSync(executable)) return executable;
  }

  const projectVenv = path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (fs.existsSync(projectVenv)) return projectVenv;

  return process.platform === 'win32' ? 'python' : 'python3';
}
