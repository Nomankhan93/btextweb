#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
EXCLUDED_DIR_NAMES = {
    '.git', 'node_modules', 'dist', 'coverage', '.cache', '__pycache__',
    '.pytest_cache', '.mypy_cache', '.ruff_cache', '.vite', '.turbo',
    '.supabase', '.patch-backups', '.artifacts', '.vercel', 'release', 'releases',
}
EXCLUDED_FILE_NAMES = {
    '.env', '.env.local', '.DS_Store', 'docker.env', 'SHA256SUMS.txt',
    'supabase.db',
}
SECRET_ASSIGNMENT = re.compile(
    rb'(?im)^\s*(?:SUPABASE_SERVICE_ROLE_KEY|BULKTEXT_SUPABASE_SERVICE_ROLE_KEY|'
    rb'SUPABASE_JWT_SECRET|JWT_SECRET|SERVICE_ROLE_KEY)\s*=\s*([^\r\n]+)'
)
JWT_LIKE = re.compile(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}')
SUPABASE_SECRET_LIKE = re.compile(rb'\bsb_secret_[A-Za-z0-9_-]{16,}\b')
CREDENTIAL_DB_URL = re.compile(rb'(?i)\bpostgres(?:ql)?://[^\s/:]+:[^\s@/]+@[^\s]+')


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def relative_excluded(rel: PurePosixPath) -> bool:
    parts = rel.parts
    if any(p in EXCLUDED_DIR_NAMES for p in parts[:-1]):
        return True
    if len(parts) >= 2 and parts[0] == 'supabase' and parts[1] in {'.temp', '.branches'}:
        return True
    name = rel.name
    if name in EXCLUDED_FILE_NAMES:
        return True
    if name.startswith('.env.') and name != '.env.example':
        return True
    if len(parts) >= 2 and parts[0] == 'supabase' and fnmatch.fnmatch(name, 'config.toml.before-*'):
        return True
    if name.endswith(('.pyc', '.pyo', '.swp', '.tmp', '.temp', '~')):
        return True
    if name.lower().endswith(('.zip', '.apk', '.aab', '.jks', '.keystore', '.p12', '.pfx', '.sqlite', '.sqlite3', '.db')):
        return True
    return False


def source_files(root: Path):
    for path in sorted((p for p in root.rglob('*') if p.is_file()), key=lambda p: p.relative_to(root).as_posix()):
        rel = PurePosixPath(path.relative_to(root).as_posix())
        if not relative_excluded(rel):
            yield path, rel


def copy_stage(root: Path, stage: Path) -> None:
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for src, rel in source_files(root):
        dst = stage / Path(*rel.parts)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        src_mode = src.stat().st_mode
        dst.chmod(0o755 if src_mode & stat.S_IXUSR else 0o644)


def scan_paths(stage: Path) -> list[str]:
    issues = []
    for path in sorted(stage.rglob('*')):
        rel = PurePosixPath(path.relative_to(stage).as_posix())
        if path.is_file() and relative_excluded(rel):
            issues.append(f'forbidden release path: {rel}')
        if path.is_dir() and (rel.name in EXCLUDED_DIR_NAMES or rel.as_posix() == 'supabase/.temp'):
            issues.append(f'forbidden release directory: {rel}')
    return issues


def assignment_is_placeholder(value: bytes) -> bool:
    text = value.decode('utf-8', errors='ignore').strip().strip('"\'')
    low = text.lower()
    return not text or any(token in low for token in ('placeholder', 'your-', '<', 'example', 'changeme', 'replace-me'))


def scan_content_bytes(name: str, data: bytes) -> list[str]:
    issues = []
    if JWT_LIKE.search(data):
        issues.append(f'JWT-like secret value in {name}')
    if SUPABASE_SECRET_LIKE.search(data):
        issues.append(f'Supabase secret-like value in {name}')
    if CREDENTIAL_DB_URL.search(data):
        issues.append(f'credential-bearing PostgreSQL URL in {name}')
    for match in SECRET_ASSIGNMENT.finditer(data):
        if not assignment_is_placeholder(match.group(1)):
            issues.append(f'non-placeholder service/JWT secret assignment in {name}')
    return issues


def scan_stage_content(stage: Path) -> tuple[list[str], dict[str, int]]:
    issues = []
    refs = {'service_role': 0, 'SUPABASE_SERVICE_ROLE_KEY': 0}
    for path in sorted(p for p in stage.rglob('*') if p.is_file()):
        rel = path.relative_to(stage).as_posix()
        data = path.read_bytes()
        issues.extend(scan_content_bytes(rel, data))
        refs['service_role'] += data.lower().count(b'service_role')
        refs['SUPABASE_SERVICE_ROLE_KEY'] += data.count(b'SUPABASE_SERVICE_ROLE_KEY')
    return issues, refs


def write_manifest(stage: Path) -> Path:
    manifest = stage / 'SHA256SUMS.txt'
    rows = []
    for path in sorted(p for p in stage.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt'):
        rel = path.relative_to(stage).as_posix()
        rows.append(f'{sha256_file(path)}  {rel}')
    manifest.write_text('\n'.join(rows) + '\n', encoding='utf-8', newline='\n')
    manifest.chmod(0o644)
    return manifest


def verify_manifest(stage: Path) -> None:
    subprocess.run(['sha256sum', '-c', 'SHA256SUMS.txt'], cwd=stage, check=True)


def deterministic_zip(stage: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = zip_path.with_suffix(zip_path.suffix + '.tmp')
    if tmp.exists():
        tmp.unlink()
    prefix = stage.name
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(p for p in stage.rglob('*') if p.is_file()):
            rel = path.relative_to(stage).as_posix()
            arcname = f'{prefix}/{rel}'
            info = zipfile.ZipInfo(arcname, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            mode = 0o755 if path.stat().st_mode & stat.S_IXUSR else 0o644
            info.external_attr = (mode & 0xFFFF) << 16
            with path.open('rb') as f:
                zf.writestr(info, f.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    tmp.replace(zip_path)


def scan_zip(zip_path: Path) -> tuple[list[str], dict[str, int]]:
    issues = []
    refs = {'service_role': 0, 'SUPABASE_SERVICE_ROLE_KEY': 0}
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in zf.infolist():
            inner = PurePosixPath(info.filename)
            rel_parts = inner.parts[1:] if len(inner.parts) > 1 else inner.parts
            rel = PurePosixPath(*rel_parts) if rel_parts else PurePosixPath('')
            if rel_parts and rel.as_posix() != 'SHA256SUMS.txt' and relative_excluded(rel):
                issues.append(f'forbidden ZIP path: {rel}')
            if info.is_dir():
                continue
            data = zf.read(info)
            issues.extend(scan_content_bytes(info.filename, data))
            refs['service_role'] += data.lower().count(b'service_role')
            refs['SUPABASE_SERVICE_ROLE_KEY'] += data.count(b'SUPABASE_SERVICE_ROLE_KEY')
    return issues, refs


def main() -> int:
    parser = argparse.ArgumentParser(description='Build deterministic BulkText clean source release ZIP.')
    parser.add_argument('--root', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--output-dir', default=None)
    parser.add_argument('--stage-dir', default=None)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    version = str(package.get('version', '')).strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise SystemExit(f'package.json contains an invalid release version: {version!r}')

    migrations = sorted((root / 'supabase' / 'migrations').glob('*.sql'))
    if not migrations:
        raise SystemExit('No Supabase migrations found; release version cannot be verified')
    latest_migration = migrations[-1]
    latest_text = latest_migration.read_text(encoding='utf-8')
    version_marker = f"'version', '{version}'"
    if version_marker not in latest_text:
        raise SystemExit(
            f'Latest migration {latest_migration.name} does not declare app_meta version {version}'
        )

    output_dir = Path(args.output_dir).resolve() if args.output_dir else root.parent / 'release'
    output_dir.mkdir(parents=True, exist_ok=True)
    stage = Path(args.stage_dir).resolve() if args.stage_dir else output_dir / f'bulktext-web-{version}'
    zip_path = output_dir / f'bulktext-web-{version}-source.zip'
    zip_sha_path = output_dir / f'bulktext-web-{version}-source.zip.sha256'

    copy_stage(root, stage)
    path_issues = scan_paths(stage)
    content_issues, stage_refs = scan_stage_content(stage)
    issues = path_issues + content_issues
    if issues:
        print('\n'.join(f'RELEASE SCAN FAIL: {x}' for x in issues), file=sys.stderr)
        return 2

    write_manifest(stage)
    verify_manifest(stage)
    deterministic_zip(stage, zip_path)
    zip_issues, zip_refs = scan_zip(zip_path)
    if zip_issues:
        print('\n'.join(f'ZIP SCAN FAIL: {x}' for x in zip_issues), file=sys.stderr)
        return 3

    zip_sha = sha256_file(zip_path)
    zip_sha_path.write_text(f'{zip_sha}  {zip_path.name}\n', encoding='utf-8', newline='\n')

    print(f'STAGE={stage}')
    print(f'ZIP={zip_path}')
    print(f'ZIP_SHA256={zip_sha}')
    print(f'ZIP_SHA_FILE={zip_sha_path}')
    print(f'STAGE_EXPECTED_IDENTIFIER_REFS service_role={stage_refs["service_role"]} SUPABASE_SERVICE_ROLE_KEY={stage_refs["SUPABASE_SERVICE_ROLE_KEY"]}')
    print(f'ZIP_EXPECTED_IDENTIFIER_REFS service_role={zip_refs["service_role"]} SUPABASE_SERVICE_ROLE_KEY={zip_refs["SUPABASE_SERVICE_ROLE_KEY"]}')
    print('RELEASE_PATH_SCAN=PASS')
    print('RELEASE_SECRET_VALUE_SCAN=PASS')
    print('ZIP_PATH_SCAN=PASS')
    print('ZIP_SECRET_VALUE_SCAN=PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
