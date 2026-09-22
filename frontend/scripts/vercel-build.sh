#!/usr/bin/env bash
#
# Vercel build for All About Accra.
#
# This lives under frontend/ because the Vercel project's Root Directory is
# frontend/ - which is the correct setting, since the deployable site depends
# on nothing outside it. docker-compose.yml, proxy/ and mise.toml at the
# repository root are irrelevant to Vercel, and with the root directory set,
# Vercel does not guarantee they are even present in the build container.
#
# Every path here is therefore relative to frontend/, not to the repository
# root.
#
# Vercel's zero-config detection looks for a package.json and a JavaScript
# framework. This is a Python static site generator, so there is nothing for it
# to detect and the whole build has to be spelled out.
#
# The virtualenv is explicit rather than a bare `pip install --user`, because
# Ursus ships `ursus` through setup.py `scripts=` rather than a console_scripts
# entry point. A user install puts it in ~/.local/bin, which is not reliably on
# PATH in the build container; a venv puts it somewhere we control.

set -euo pipefail

# Work out where we are and move to frontend/, whatever the caller's working
# directory was.
#
# This matters because Vercel's Root Directory setting decides where it looks
# for vercel.json and package.json, and getting that wrong does not produce an
# error - Vercel simply detects no framework, runs no build, and static-serves
# the directory instead. Neither the repository root nor frontend/ contains an
# index.html, so the deploy "succeeds" and every URL returns 404.
#
# Rather than depend on that setting being right, this script locates itself
# and works from frontend/ either way. Config exists at both levels so that
# whichever directory Vercel treats as the root, it finds something.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

# Ursus reads content files without an explicit encoding. Linux build images
# already default to UTF-8, so this is belt and braces there - but it makes the
# script correct if it is ever run on Windows, where the default is cp1252 and
# the build dies on the first cedi sign.
export PYTHONUTF8=1

echo "==> Working directory: $(pwd)"

# Resolve the interpreter rather than assuming `python3`. Linux build images
# provide python3 and usually not python; Windows provides python and a
# `python3` shim that opens the Microsoft Store instead of running anything.
# Being explicit means this script can be run locally to debug a failing
# deploy, which is the whole reason it exists.
PYTHON=""
for candidate in python3 python; do
	if command -v "${candidate}" >/dev/null 2>&1 && "${candidate}" -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >/dev/null 2>&1; then
		PYTHON="${candidate}"
		break
	fi
done

if [ -z "${PYTHON}" ]; then
	echo "ERROR: no Python 3.11+ interpreter found. Ursus requires 3.11 or newer." >&2
	exit 1
fi

echo "==> Python: $(${PYTHON} --version) (${PYTHON})"

# If this line is missing from the build log, Vercel is not running this script
# at all - which means it never found vercel.json, and it will fall back to
# static-serving frontend/. That directory has no index.html, so the deploy
# succeeds and every URL returns 404 with no error anywhere. Say so loudly.
echo "==> vercel.json was found and this build script is running"

"${PYTHON}" -m venv .vercel-venv

# Linux and macOS put the venv executables in bin/; Windows puts them in
# Scripts/. Vercel is always Linux, but this keeps the script runnable locally.
if [ -d .vercel-venv/bin ]; then
	VENV_BIN=".vercel-venv/bin"
else
	VENV_BIN=".vercel-venv/Scripts"
fi
export PATH="${PWD}/${VENV_BIN}:${PATH}"

echo "==> Installing dependencies"

# Upgrading pip is a nicety, not a requirement, and it cannot replace itself
# in-place when invoked as pip.exe on Windows. Go through `python -m pip`, and
# never let it fail the build.
python -m pip install --upgrade pip --quiet || echo "    (pip upgrade skipped)"

python -m pip install -r requirements.txt --quiet

echo "==> Building the site"

# Build into public/ rather than output/.
#
# This is the belt-and-braces part. `public` is the directory Vercel serves by
# default when no framework is detected and no Output Directory is configured.
# Building there means the deploy works even if vercel.json is never read -
# which is exactly the failure that produced a silent 404, because Vercel does
# not error when it cannot find its config, it just static-serves the root
# directory instead.
#
# Local builds, Docker and mise are untouched: they use output/, which is what
# ursus_config.py defaults to when URSUS_OUTPUT_DIR is unset.
export URSUS_OUTPUT_DIR="public"

# Ursus reads ./ursus_config.py from the working directory. That is frontend/,
# which is already the working directory here.
ursus build

pages="$(find "${URSUS_OUTPUT_DIR}" -name '*.html' | wc -l)"
echo "==> Built ${pages} pages into frontend/${URSUS_OUTPUT_DIR}"

# A build that produces no pages, or no homepage, still "succeeds" as far as
# Vercel is concerned - and then every request 404s at runtime with nothing in
# the log to explain it. Fail here instead, where the reason is visible.
if [ "${pages}" -eq 0 ]; then
	echo "ERROR: the build produced no HTML. Refusing to deploy an empty site." >&2
	exit 1
fi

if [ ! -f "${URSUS_OUTPUT_DIR}/index.html" ]; then
	echo "ERROR: ${URSUS_OUTPUT_DIR}/index.html is missing, so the site root would 404." >&2
	exit 1
fi

echo "==> ${URSUS_OUTPUT_DIR}/index.html is present; deploying $(du -sh "${URSUS_OUTPUT_DIR}" | cut -f1)"
ls -la "${URSUS_OUTPUT_DIR}" | head -12
