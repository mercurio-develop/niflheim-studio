"""Pack a project as a sample: a zip of its project.json and only the files it uses (the current
version of every result, the stage, the takes), not the versions and attempts it kept along the
way. A project of 555 MB packs to a zip of about 140 MB, still too big for the repo: the zip goes on a
GitHub Release, and unzips into data/projects/.

Run: python pack_sample.py data/projects/<id> out.zip
"""

import json
import os
import sys
import zipfile


def used(project_dir, data):
    """Every string in project.json that names a file inside the project."""
    found = set()

    def walk(x):
        if isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, str) and "/" in x and ".." not in x and os.path.isfile(os.path.join(project_dir, x)):
            found.add(x)

    walk(data)
    return found


def main():
    project_dir, out = sys.argv[1], sys.argv[2]
    with open(os.path.join(project_dir, "project.json")) as f:
        data = json.load(f)
    files = sorted(used(project_dir, data))
    name = data["id"]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(project_dir, "project.json"), f"{name}/project.json")
        for f in files:
            z.write(os.path.join(project_dir, f), f"{name}/{f}")
    size = os.path.getsize(out) / 1e6
    print(json.dumps({"project": name, "files": len(files) + 1, "zip_mb": round(size, 1)}))


if __name__ == "__main__":
    main()
