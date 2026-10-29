import path from "node:path";
import { homedir } from "node:os";

// The Python the helper scripts in scripts/ run with (numpy, opencv, pillow, scipy, torch,
// trimesh): NIFL_PYTHON, else ComfyUI's own venv. Server only.
export const PYTHON = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
