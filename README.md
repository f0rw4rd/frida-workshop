# Frida Workshop

A 2-hour hands-on dynamic instrumentation workshop for FHLUG.

## Setup

```bash
git clone https://github.com/f0rw4rd/frida-workshop.git
cd frida-workshop
./setup.sh
```

Installs `frida-tools`, sets `ptrace_scope=0`, and builds the exercise binaries.

## Layout

- `slides/` — workshop slides (markdown). Build with `python3 build.py` → `presentation.html`.
- `exercises/` — 8 exercises (`ex01`–`ex08`) with sources, binaries, and Frida solutions.
- `exercises/src/` — C sources for the target binaries.
- `exercises/bin/` — compiled targets (built by `make`).
- `exercises/solutions/` — Frida JS solution scripts.

## Run a solution

```bash
frida -f exercises/bin/ex01_password_check -l exercises/solutions/ex03_hook_password.js
```
