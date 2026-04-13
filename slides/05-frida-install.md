# Module 5: Installing Frida & First Steps

---

## What is Frida?

**Frida** is a **dynamic instrumentation toolkit** created by Ole Andre Vadla Ravnas.

It lets you:
- **Inject** JavaScript into running processes
- **Hook** any function (library or internal)
- **Read and modify** arguments, return values, and memory
- **Call** functions that the program never intended you to call
- Do all this **at runtime**, without modifying the binary on disk

### Think of it as:
> "ltrace on steroids, with the ability to change everything you observe"

**Website:** https://frida.re | **Source:** https://github.com/frida/frida | **License:** wxWindows (permissive)

---

## Frida: Supported Platforms

| Platform | Use case |
|---|---|
| **Linux** (x86, x64, ARM) | This course - desktop/server RE |
| **Android** | Mobile app security, APK analysis |
| **iOS / macOS** | App store app analysis, jailbreak research |
| **Windows** | Malware analysis, game hacking, thick-client pentesting |
| **QNX / FreeBSD** | Embedded/automotive - often the *only* dynamic analysis option |

Today we focus on **Linux**, but your Frida skills transfer directly to all platforms.

---

## Frida Architecture


```
┌─────────────────────────────────────────────────────┐
│                  YOUR MACHINE                        │
│                                                      │
│  ┌──────────────┐         ┌───────────────────────┐ │
│  │ Frida Client │         │    Target Process      │ │
│  │              │  IPC    │                         │ │
│  │  Python /    │ <────> │  ┌──────────────────┐  │ │
│  │  JS / CLI    │         │  │   Frida Agent    │  │ │
│  │              │         │  │   (injected JS)  │  │ │
│  └──────────────┘         │  │                  │  │ │
│                           │  │  ┌────────────┐  │  │ │
│                           │  │  │  Gum Engine │  │  │ │
│                           │  │  │ (C, native) │  │  │ │
│                           │  │  └────────────┘  │  │ │
│                           │  └──────────────────┘  │ │
│                           └───────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Three key components:
1. **Client** - your scripts (Python, JS, or CLI) that send instructions
2. **Agent** - JavaScript runtime injected into the target process
3. **Gum** - native C engine that performs the actual instrumentation (hooks, memory access, stalking)

---

## How Frida Works on Linux

### Injection process (step by step):

```
1. frida -p 1234 -l script.js
       │
2. Frida uses ptrace() to attach to process 1234
       │
3. Injects a shared library (frida-agent.so) into the target
       │
4. frida-agent.so starts a V8/QuickJS JavaScript runtime
       │
5. Your script.js is loaded into that runtime
       │
6. Gum engine hooks functions as directed by your script
       │
7. Client ←──IPC──→ Agent communicate results back
```

**Key points:**
- Uses **ptrace** for initial injection (same mechanism as strace/ltrace/gdb)
- After injection, communication is via a **pipe/socket** (not ptrace)
- The JS engine runs **inside** the target process's address space
- Hooks are implemented via **inline hooking** (rewriting function prologues)

---

## Installation Method 1: pip (Recommended)

### This is the simplest and most reliable method.

```bash
# Install frida-tools (includes frida CLI, frida-trace, frida-ps, etc.)
$ pip install frida-tools
```

```
Collecting frida-tools
  Downloading frida_tools-12.5.1-py3-none-any.whl (178 kB)
Collecting frida>=16.5.6
  Downloading frida-16.5.6-cp312-cp312-manylinux_2_28_x86_64.whl (42.3 MB)
...
Successfully installed frida-16.5.6 frida-tools-12.5.1
```

### Verify the installation:

```bash
$ frida --version
16.5.6

$ which frida
/home/user/.local/bin/frida

$ which frida-trace
/home/user/.local/bin/frida-trace
```

If `frida` is not found after pip install, ensure `~/.local/bin` is in your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## Verify Installation: frida-ps

**frida-ps** lists processes that Frida can attach to.

```bash
$ frida-ps
```

```
  PID  Name
-----  ----------------------------------------
    1  systemd
  487  systemd-journald
  512  systemd-udevd
  845  NetworkManager
  891  sshd
 1023  bash
 1247  firefox
 1389  code
 2156  Xorg
 ...
```

If you see a process list, **Frida is working.**

### Common frida-ps options:

```bash
# Show all processes with full details
$ frida-ps -a

# Show only applications (on Android/iOS - less relevant on desktop)
$ frida-ps -ai

# List USB-connected devices (for mobile testing)
$ frida-ps -U
```

---

## Frida CLI Tools Overview

Installing `frida-tools` gives you several command-line utilities:

| Tool | Purpose | Example |
|------|---------|---------|
| **frida** | Interactive REPL / script loader | `frida -p 1234 -l script.js` |
| **frida-trace** | Auto-generate hooks for functions | `frida-trace -i "strcmp" ./prog` |
| **frida-ps** | List running processes | `frida-ps` |
| **frida-discover** | Discover internal functions | `frida-discover -p 1234` |
| **frida-kill** | Kill a process by PID | `frida-kill 1234` |
| **frida-ls-devices** | List available Frida devices | `frida-ls-devices` |

### The ones we will use most:

1. **frida** - the main tool: attach to processes, load scripts, use the REPL
2. **frida-trace** - quick function tracing without writing full scripts
3. **frida-ps** - find process IDs to attach to

---

## First Test: frida-trace

Let's trace the `openat` syscall wrapper in libc when `ls` runs:

```bash
$ frida-trace -i "openat" /bin/ls
```

```
Instrumenting...
openat: Auto-generated handler at "__handlers__/libc.so.6/openat.js"
Started tracing 1 function. Press Ctrl+C to stop.
           /* TID 0x1a3b */
  3412 ms  openat(dfd=-100, pathname="/etc/ld.so.cache", flags=0x80000)
  3413 ms  openat(dfd=-100, pathname="/lib/x86_64-linux-gnu/libselinux.so.1", flags=0x80000)
  3413 ms  openat(dfd=-100, pathname="/lib/x86_64-linux-gnu/libc.so.6", flags=0x80000)
  3414 ms  openat(dfd=-100, pathname="/usr/lib/locale/locale-archive", flags=0x80000)
  3415 ms  openat(dfd=-100, pathname=".", flags=0x90800)
Process terminated
```

### What just happened:
1. Frida **spawned** `/bin/ls`
2. **Injected** its agent into the process
3. **Hooked** the `openat` function in libc
4. **Logged** every call with arguments
5. Process exited normally

---

## First Test: frida-trace on strcmp

Remember our password checker from Module 4? Let's trace it with Frida:

```bash
$ frida-trace -i "strcmp" ./password_checker
```

```
Instrumenting...
strcmp: Auto-generated handler at "__handlers__/libc.so.6/strcmp.js"
Started tracing 1 function. Press Ctrl+C to stop.
Enter the secret code: wrongpassword
  2847 ms  strcmp()
Wrong code! Access denied.
Process terminated
```

### But wait - frida-trace shows `strcmp()` without the arguments!

That is because the auto-generated handler is minimal. Let's **edit it**:

```bash
$ cat __handlers__/libc.so.6/strcmp.js
```

```javascript
{
  onEnter(log, args, state) {
    log('strcmp()');
  },
  onLeave(log, retval, state) {
  }
}
```

---

## Customizing frida-trace Handlers

Edit the auto-generated handler to show arguments:

```javascript
// __handlers__/libc.so.6/strcmp.js
{
  onEnter(log, args, state) {
    log('strcmp("' + args[0].readUtf8String() + '", "' +
        args[1].readUtf8String() + '")');
  },
  onLeave(log, retval, state) {
    log('  => ' + retval);
  }
}
```

### Run again:

```bash
$ frida-trace -i "strcmp" ./password_checker
```

```
Enter the secret code: wrongpassword
  2891 ms  strcmp("wrongpassword", "LUG_h4ck3r_2024")
  2891 ms    => 0xb
Wrong code! Access denied.
Process terminated
```

**Now we can see the arguments AND the return value** - just like ltrace, but with full control to modify things.

---

## The Frida REPL

The **frida** command gives you an interactive JavaScript console inside the target process:

```bash
# Spawn a process and get a REPL
$ frida ./password_checker
```

```
     ____
    / _  |   Frida 16.5.6 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to Local System (id=local)
   . . . .   Spawned `./password_checker`. Use %resume to let the main
   . . . .   thread start executing!

[Local::password_checker ]->
```

---

## The Frida REPL (cont.)

### Try some commands:

```javascript
// List loaded modules (shared libraries)
Process.enumerateModules()

// Find the address of strcmp
Module.getGlobalExportByName("strcmp")
// => "0x7f1a2b3c4d50"

// Resume the process
%resume
```

---

## Frida REPL: Exploring a Process

```javascript
// List all loaded modules (libraries)
[Local::password_checker ]-> Process.enumerateModules()
[
  { "name": "password_checker", "base": "0x5555555540000", "size": 16384 },
  { "name": "libc.so.6", "base": "0x7f1a2b300000", "size": 2097152 },
  { "name": "ld-linux-x86-64.so.2", "base": "0x7f1a2b500000", "size": 245760 }
]

// Find exports of libc
[Local::password_checker ]-> Module.enumerateExports("libc.so.6").slice(0, 5)
[
  { "type": "function", "name": "strcmp", "address": "0x7f1a2b3c4d50" },
  { "type": "function", "name": "strlen", "address": "0x7f1a2b3c5e60" },
  { "type": "function", "name": "printf", "address": "0x7f1a2b3a1230" },
  { "type": "function", "name": "malloc", "address": "0x7f1a2b3b5a00" },
  { "type": "function", "name": "free", "address": "0x7f1a2b3b5c10" }
]

// Read a string from memory
[Local::password_checker ]-> ptr("0x555555556004").readUtf8String()
"Enter the secret code: "
```

---

## Troubleshooting: Common Issues

### 1. "pip install frida-tools" fails

```bash
# Error: externally-managed-environment (PEP 668, common on newer distros)
# Solution: use a virtual environment
$ python3 -m venv ~/frida-env
$ source ~/frida-env/bin/activate
(frida-env) $ pip install frida-tools
```

### 2. "Failed to attach: unexpected error" / Permission denied

```bash
# Check ptrace_scope
$ cat /proc/sys/kernel/yama/ptrace_scope
1  # <-- This is the problem

# Fix it
$ echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

### 3. "frida: command not found"

```bash
# pip installed to ~/.local/bin, which is not in PATH
$ export PATH="$HOME/.local/bin:$PATH"

# Make it permanent
$ echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

Hit another issue? Ask the presenter.

---

## Workshop Setup

```bash
$ git clone https://github.com/f0rw4rd/frida-workshop.git
$ cd frida-workshop
$ ./setup.sh
```

The script installs `frida-tools`, sets `ptrace_scope=0`, and builds the exercise binaries.

If it fails, see the Troubleshooting slide - or ask.

---

## What We Have Now vs What's Next

### Our toolkit so far:

| Tool | Can observe? | Can modify? | Ease of use |
|------|-------------|-------------|-------------|
| `strings` | Yes (static) | No | Very easy |
| `file` / `readelf` | Yes (metadata) | No | Easy |
| `strace` | Yes (syscalls) | No | Easy |
| `ltrace` | Yes (lib calls) | No | Easy |
| **Frida** | **Yes** | **Yes** | Moderate |

### Coming up in the next modules:

- **Module 6:** Frida JavaScript API deep-dive
  - `Interceptor.attach()` - hook any function
  - Reading and writing memory
  - Modifying arguments and return values
- **Module 7:** Practical exercises
  - Bypass the password checker by hooking `strcmp`
  - Bypass a license check by hooking the validation function
  - Trace encryption calls to extract keys

---

## Summary

### What we installed:
- **frida-tools** via pip (frida, frida-trace, frida-ps, etc.)
- Set **ptrace_scope=0** for unrestricted process attachment

### What we learned:
- Frida's architecture: **Client** <-> **Agent** (injected) <-> **Gum** (native engine)
- On Linux, Frida uses **ptrace** for initial injection, then IPC for communication
- **frida-trace** auto-generates hook handlers for any function
- **frida** REPL lets you interactively explore a running process
- We can already **see** function calls and arguments (like ltrace), and soon we will **modify** them

### Key commands to remember:
```bash
frida-ps                            # List processes
frida-trace -i "func" ./program     # Trace a function
frida ./program                     # Interactive REPL
frida -p PID -l script.js           # Attach with a script
```

### Next: Writing our first Frida scripts to bypass password checks!
