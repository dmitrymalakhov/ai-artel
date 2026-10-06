"""Package ready assets separately from generated source sheets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

project = Path(__file__).resolve().parents[2]
plans = [
    ("AI_ARTEL_DOOR_ANIMATIONS_V2.zip", "07_DOOR_ANIMATIONS", "all"),
    ("AI_ARTEL_LOUNGE_AND_SOCIAL_V1.zip", "08_LOUNGE_AND_SOCIAL", "ready"),
    ("AI_ARTEL_LOUNGE_SOURCES_V1.zip", "08_LOUNGE_AND_SOCIAL", "sources"),
]
for name, folder, selection in plans:
    target = project / name
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted((project / folder).rglob("*")):
            if not file.is_file() or file.name == ".DS_Store":
                continue
            is_source = "sources" in file.relative_to(project / folder).parts
            if selection == "ready" and is_source:
                continue
            if selection == "sources" and not is_source:
                continue
            archive.write(file, file.relative_to(project).as_posix())
    with ZipFile(target) as archive:
        assert archive.testzip() is None, name
        count = len(archive.namelist())
    assert target.stat().st_size < 100 * 1024 * 1024, name + " is too large"
    print(f"{name}: {count} files, {target.stat().st_size / 1024**2:.2f} MiB, CRC verified")
