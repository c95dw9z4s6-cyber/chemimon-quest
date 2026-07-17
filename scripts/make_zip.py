from pathlib import Path
import sys, zipfile
source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
root_name = sys.argv[3]
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for item in sorted(source.rglob('*')):
        if item.is_file():
            zf.write(item, Path(root_name) / item.relative_to(source))
with zipfile.ZipFile(target) as zf:
    bad = zf.testzip()
    if bad:
        raise SystemExit(f'corrupt zip member: {bad}')
print(target)
