#!/bin/bash
# Frida workshop setup: install frida-tools, set ptrace_scope=0, build binaries.
set -e

pip install --user frida-tools

if [ "$(cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null)" != "0" ]; then
    echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
fi

make all
echo "FREE_USER" > exercises/bin/config.dat

echo
echo "Setup complete. Verify with: frida --version && frida-ps | head"
