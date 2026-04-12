---
title: "Advanced Frida and Where to Go Next"
theme: default
paginate: true
---

# Advanced Frida
## And Where to Go Next

### Beyond the basics - real-world techniques

---

## The Problem: Stripped Binaries

So far we have hooked **exported functions** by name:

```javascript
Module.getGlobalExportByName("strcmp")  // Works for libc exports
```

But what about:
- **Stripped binaries** (compiled with `strip` - symbol names removed) - no symbol names at all
- **Static functions** - not exported, invisible to `findExportByName`
- **Inlined functions** - compiled directly into the caller
- **Obfuscated code** - symbols deliberately removed or mangled

For these cases, we need to hook **by address**.

---

## Hooking by Address

Every function lives at a memory address. If you know the **offset** from
the binary's base address, you can hook it directly:

```javascript
// Find where the binary is loaded in memory
const base = Process.findModuleByName("target").base;
console.log("[*] Base address:", base);

// Hook the function at offset 0x1234 from the base
Interceptor.attach(base.add(0x1234), {
    onEnter(args) {
        console.log("[*] Function at offset 0x1234 called");
        console.log("    arg0:", args[0]);
        console.log("    arg1:", args[1].toInt32());
    },
    onLeave(retval) {
        console.log("    returned:", retval.toInt32());
    }
});
```

The offset `0x1234` comes from **static analysis** - your disassembler.

---

## Finding Offsets: The Static + Dynamic Workflow

### Step 1: Static analysis - find the offset

```bash
# With objdump
objdump -d ./target | grep -A5 "check_password"
# 0000000000001234 <check_password>:
#     1234:  55              push   %rbp
#     1235:  48 89 e5        mov    %rsp,%rbp

# With readelf
readelf -s ./target | grep check
# 42: 0000000000001234  48 FUNC LOCAL DEFAULT 14 check_password

# With nm
nm ./target | grep check
# 0000000000001234 t check_password
```

The offset is `0x1234` - the address in the **file** (before loading).

### Step 2: Dynamic hooking - use the offset with Frida

```javascript
const base = Process.findModuleByName("target").base;
Interceptor.attach(base.add(0x1234), { ... });
```

Frida handles ASLR automatically. `base.add(offset)` always resolves correctly.

---

## Finding Offsets: Using Ghidra

Ghidra (free, from NSA) decompiles binaries into C-like pseudocode and shows function addresses.

1. Open the binary in Ghidra
2. Let the auto-analyzer run
3. Navigate the function list or search for interesting strings
4. Find the function you want to hook
5. Note the address - Ghidra shows the **file offset**

```
                     check_password
  001011a4  55           PUSH    RBP
  001011a5  48 89 e5     MOV     RBP,RSP
  001011a8  48 83 ec 10  SUB     RSP,0x10
  ...
```

In Ghidra, the default base is often `0x00100000`, so the real offset is:

```
0x001011a4 - 0x00100000 = 0x11a4
```

```javascript
const base = Process.findModuleByName("target").base;
Interceptor.attach(base.add(0x11a4), { ... });
```

---

## Practical Example: Hooking a Stripped Binary

```bash
# Strip all symbols from our binary
strip --strip-all ./target

# Verify: no symbols left
nm ./target
# nm: ./target: no symbols

# Find functions by analyzing the disassembly
objdump -d ./target | less
# Look for function prologues: push rbp; mov rsp, rbp
```

```javascript
// Hook the stripped binary by offset
const base = Process.findModuleByName("target").base;

// We found these offsets from our disassembly analysis
const checkPassword = base.add(0x11a4);  // The password check
const mainFunc = base.add(0x1220);       // main()

Interceptor.attach(checkPassword, {
    onEnter(args) {
        console.log("[*] Password check called!");
        console.log("    Input:", args[0].readUtf8String());
    },
    onLeave(retval) {
        console.log("    Result:", retval.toInt32());
        retval.replace(1);  // Force success
    }
});
```

See **`exercises/ex07-stripped-hooking.md`** - hook a stripped binary by address.

---

## Enumerating Functions by Pattern

When you do not know exact offsets, scan for function prologues:

```javascript
// Find all functions in the main binary by scanning for
// common x86_64 function prologues
const mod = Process.enumerateModules()[0];  // Main binary

var matches = Memory.scanSync(mod.base, mod.size,
    "55 48 89 e5"  // push rbp; mov rbp, rsp
);

for (var i = 0; i < matches.length; i++) {
    console.log("[*] Possible function at:", matches[i].address,
                "offset:", matches[i].address.sub(mod.base));
}
console.log("[*] Scan complete -", matches.length, "matches found");
```

This is a rough heuristic - not every match is a real function, and not
every function starts with this prologue. But it is a useful starting point.

---

## Stalker: Frida's Code Tracing Engine

**Stalker** is Frida's instruction-level tracing engine.
It can trace every single instruction, call, or block executed.

```javascript
// Follow the current thread and log all CALL instructions
Stalker.follow(Process.getCurrentThreadId(), {
    events: {
        call: true,    // Log CALL instructions
        ret: false,    // Skip RET instructions
        exec: false,   // Skip every executed instruction (noisy!)
        block: false   // Skip basic block entries
    },

    onReceive(events) {
        // events is a binary blob - parse it
        var parsed = Stalker.parse(events);
        parsed.forEach(function(event) {
            console.log("CALL from", event[1], "to", event[2]);
        });
    }
});

// Stop tracing after 5 seconds
setTimeout(function() {
    Stalker.unfollow(Process.getCurrentThreadId());
    console.log("[*] Stalker stopped");
}, 5000);
```

---

## Stalker: Frida's Code Tracing Engine (cont.)

### Call Summary - a more practical approach

```javascript
Stalker.follow(Process.getCurrentThreadId(), {
    events: { call: true },
    onCallSummary(summary) {
        Object.keys(summary).forEach(function(addr) {
            var sym = DebugSymbol.fromAddress(ptr(addr));
            if (summary[addr] > 1)
                console.log(`  ${sym} called ${summary[addr]} times`);
        });
    }
});
```

Use cases: **code coverage**, **function discovery**, **performance profiling**.
**Warning:** Stalker is powerful but slow. Use it selectively.

---

## Stalker: The Transform Callback

Stalker's most powerful feature is `transform` - rewrite instructions as they execute:

```javascript
// Code coverage: record which basic blocks execute
const coverage = new Set();
const mod = Process.findModuleByName("target");

Stalker.follow(Process.getCurrentThreadId(), {
    transform(iterator) {
        const first = iterator.next();
        const addr = first.address;

        // Only instrument our target module
        if (addr.compare(mod.base) >= 0 &&
            addr.compare(mod.base.add(mod.size)) < 0) {
            const offset = addr.sub(mod.base).toInt32();
            iterator.putCallout(() => { coverage.add(offset); });
        }

        do { iterator.keep(); }
        while (iterator.next() !== null);
    }
});
```

---

## Stalker: The Transform Callback (cont.)

### Key Stalker APIs

| API | Purpose |
|---|---|
| `transform(iterator)` | Rewrite basic blocks at compile time |
| `iterator.putCallout(fn)` | Insert JS callback at current instruction |
| `Stalker.addCallProbe(addr, fn)` | Lightweight: fire callback when addr is called |
| `Stalker.flush()` | Force delivery of buffered events |
| `Stalker.garbageCollect()` | Free stale recompiled code blocks |
| `Stalker.trustThreshold` | `-1` = never retransform (faster for static code) |

### Performance tips
- **Filter by module** in `transform` - skip libc/ld-linux blocks
- Use `compile` events (once per block) instead of `exec` (every instruction)
- Prefer `onCallSummary` over individual `call` events for counting
- Scope stalking: `follow`/`unfollow` only around the function of interest

### Exporting coverage for visualization
- **frida-drcov.py** outputs DynamoRIO DRCOV format from Stalker
- Load into **Lighthouse** (IDA) or **Dragondance** (Ghidra) for visual coverage maps
- Workflow: `python frida-drcov.py -o coverage.log ./target` then open in IDA/Ghidra

---

## Frida-Based Fuzzing

Stalker's coverage data can feed **AFL++** for coverage-guided fuzzing of closed-source binaries.

### fpicker (github.com/ttdennis/fpicker)
- AFL++ proxy mode: Frida/Stalker populates AFL's coverage bitmap
- Standalone mode: built-in mutations with Stalker call summaries
- Harness is a JS class with a `fuzz(payload)` method

```javascript
// fpicker harness pattern
class MyFuzzer extends Fuzzer.Fuzzer {
    fuzz(payload) {
        var buf = Memory.alloc(payload.byteLength);
        Memory.writeByteArray(buf, payload);
        targetFunc(buf, payload.byteLength);  // call target with fuzzed input
    }
}
var f = new MyFuzzer("/path/to/corpus");
f.start();
```

Other tools: **frizzer** (network service fuzzing), **hotwax** (Stalker-based)

Frida enables **blackbox fuzzing** of any binary on any platform - no source code needed.

---

## Python Bindings: Full Automation

For production tooling, use Frida's **Python bindings**:

```python
#!/usr/bin/env python3
import frida
import sys

js_code = """
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        send({
            s1: args[0].readUtf8String(),
            s2: args[1].readUtf8String()
        });
    }
});
"""
```

---

## Python Bindings: Full Automation (cont.)

```python
def on_message(message, data):
    if message['type'] == 'send':
        payload = message['payload']
        print(f"[*] strcmp: \"{payload['s1']}\" vs \"{payload['s2']}\"")
    elif message['type'] == 'error':
        print(f"[!] Error: {message['stack']}")

# Spawn the target process
pid = frida.spawn(["./target"])
session = frida.attach(pid)

# Load and run the script
script = session.create_script(js_code)
script.on('message', on_message)
script.load()

# Resume the process (it was spawned paused)
frida.resume(pid)

print("[*] Running. Press Ctrl+C to stop.")
sys.stdin.read()
```

---

## Python Bindings: Full Automation (cont.)

### When to use Python bindings vs. the CLI

| Feature | REPL / CLI | Python Bindings |
|---|---|---|
| Quick experiments | Best choice | Overkill |
| Automated testing | Awkward | Natural |
| Processing results | Limited | Full Python ecosystem |
| Multi-process orchestration | Difficult | Easy |
| CI/CD integration | Hacky | Clean |

Key APIs: `frida.spawn()` / `frida.attach()`, `session.create_script()`, `script.on('message', callback)`

---

## Python Bindings: Full Automation (cont.)

### Spawn gating (instrumenting child processes)
```python
device.enable_spawn_gating()
device.on('spawn-added', lambda spawn: instrument_child(spawn.pid))
```
Essential for multiprocess daemons and fork-based services.

---

## Python Bindings: Advanced Orchestration

```python
#!/usr/bin/env python3
"""Automated password brute-forcer using Frida."""

import frida
import subprocess

js_code = """
var found = false;
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        try {
            var s1 = args[0].readUtf8String();
            var s2 = args[1].readUtf8String();
            if (s2.length > 3) {
                send({type: "password", value: s2});
                found = true;
            }
        } catch(e) {}
    }
});
"""
```

---

## Python Bindings: Advanced Orchestration (cont.)

```python
def on_message(message, data):
    if message['type'] == 'send':
        payload = message['payload']
        if payload['type'] == 'password':
            print(f"\n[!] PASSWORD FOUND: {payload['value']}")

pid = frida.spawn(["exercises/bin/ex01_password_check"],
                   stdio='pipe')
session = frida.attach(pid)
script = session.create_script(js_code)
script.on('message', on_message)
script.load()
frida.resume(pid)

# Feed input to the process
device = frida.get_local_device()
device.input(pid, b"test\n")

import time; time.sleep(2)
session.detach()
```

---

## r2frida: The Best of Both Worlds

**r2frida** combines radare2's static analysis with Frida's dynamic capabilities:

```bash
# Install r2frida
r2pm -ci r2frida

# Attach to a process with r2frida
r2 frida://./target
```

Inside the r2frida session:

```
# List modules
\il

# List exports of a module
\iE libc.so.6

# Search for strings in memory
\/ password

# Disassemble at an address
pd 20 @ sym.check_password

# Run Frida JavaScript directly
\. script.js

# Intercept a function
\di0 strcmp    # Hook strcmp and print args
```

r2frida lets you do static analysis and dynamic hooking in a **single session**.

---

## Anti-Instrumentation: How Targets Fight Back

Sophisticated software may try to detect or prevent instrumentation:

### ptrace-based detection

```c
// If ptrace is already attached (by a debugger), this fails
if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) == -1) {
    printf("Debugger detected!\n");
    exit(1);
}
```

### Self-integrity checks

```c
// Hash the .text section and compare with expected value
// Frida's hooks modify the code, changing the hash
unsigned char hash[32];
sha256(code_start, code_size, hash);
if (memcmp(hash, expected_hash, 32) != 0) {
    exit(1);  // Code was modified!
}
```

### Timing checks

```c
// Instrumented code runs slower
struct timespec start, end;
clock_gettime(CLOCK_MONOTONIC, &start);
do_sensitive_operation();
clock_gettime(CLOCK_MONOTONIC, &end);
if (elapsed_ms(start, end) > 100) {
    exit(1);  // Too slow - probably instrumented
}
```

---

## Bypassing Anti-Instrumentation

Frida can counter each technique:

### Bypass ptrace detection

```javascript
Interceptor.attach(Module.getGlobalExportByName("ptrace"), {
    onEnter(args) {
        console.log("[*] ptrace called - blocking");
    },
    onLeave(retval) {
        retval.replace(0);  // Pretend it succeeded
    }
});
```

---

## Bypassing Anti-Instrumentation (cont.)

### Bypass integrity checks

```javascript
// Hook the hash comparison to always return "match"
Interceptor.attach(Module.getGlobalExportByName("memcmp"), {
    onEnter(args) {
        // You may want to be selective here
        this.isIntegrityCheck = args[2].toInt32() === 32; // SHA-256 size
    },
    onLeave(retval) {
        if (this.isIntegrityCheck) {
            retval.replace(0);  // 0 = match
        }
    }
});
```

### Bypass timing checks

```javascript
// Hook clock_gettime to return consistent values
Interceptor.attach(Module.getGlobalExportByName("clock_gettime"), {
    onLeave(retval) {
        // Make time appear to pass very quickly
    }
});
```

See **`exercises/ex06-anti-debug-bypass.md`** for a quick ptrace bypass, and **`exercises/ex08-advanced-bypass.md`** for a full anti-debug bypass script.

---

## A Note on Frida's Stealth

Frida is relatively stealthy compared to traditional debuggers:

- **No ptrace attachment** - Frida uses code injection, not ptrace
- **Process name** - Frida's agent runs as a thread inside the target
- **Memory artifacts** - `frida-agent.so` is mapped in `/proc/PID/maps`

### Detection vectors against Frida on Linux

| Vector | Method | Bypass |
|---|---|---|
| Library scanning | `/proc/self/maps` for `frida-agent` | Hook `open`/`read` to filter output |
| Thread names | `/proc/self/task/*/comm` for `gmain`, `gum-js-loop` | Rename threads via `prctl` hook |
| Named pipes | `/proc/self/fd/` for `linjector` pipes | Patched Frida builds |
| Port scanning | Connect to localhost:27042 | `frida-server -l 0.0.0.0:CUSTOM_PORT` |
| Env variables | `FRIDA_*` in `/proc/self/environ` | Clean environment before spawning |
| Memory strings | Scan for `"LIBFRIDA"`, `"GumJS"` | Build Frida from source with patched strings |
| Code integrity | Checksum function prologues | Use Stalker instead (no inline patching) |
| Raw syscalls | Direct `SYS_openat` bypassing libc hooks | Stalker-level syscall interception |

The arms race continues - each detection can be bypassed, but raw syscalls
and code integrity checks are the hardest to defeat.

```javascript
// Example: hide frida-agent from /proc/self/maps reads
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) {
        var path = args[0].readUtf8String();
        if (path.includes("/proc/self/maps")) {
            console.log("[!] Process is reading /proc/self/maps");
            // Could redirect to a filtered copy
        }
    }
});
```

---

## Real-World Applications: Network Analysis

### Malware Analysis - map C2 infrastructure

```javascript
Interceptor.attach(Module.getGlobalExportByName("connect"), {
    onEnter(args) {
        var sockaddr = args[1];
        var family = sockaddr.readU16();
        if (family === 2) {  // AF_INET
            var port = (sockaddr.add(2).readU8() << 8) |
                        sockaddr.add(3).readU8();
            var ip = [4,5,6,7].map(i => sockaddr.add(i).readU8()).join('.');
            console.log(`[*] connect -> ${ip}:${port}`);
        }
    }
});
```

### Protocol RE - watch raw bytes on the wire

```javascript
Interceptor.attach(Module.getGlobalExportByName("send"), {
    onEnter(args) {
        console.log("[SEND]", args[2].toInt32(), "bytes:");
        console.log(hexdump(args[1], { length: Math.min(args[2].toInt32(), 256) }));
    }
});
```

Hook network calls in a VM to map C2 servers or decode proprietary protocols.

---

## Real-World Applications: Security and Modding

### Security Auditing - monitor dangerous calls

```javascript
["system", "exec", "popen", "dlopen"].forEach(function(name) {
    var addr = Module.getGlobalExportByName(name);
    if (addr) {
        Interceptor.attach(addr, {
            onEnter(args) {
                console.log(`[AUDIT] ${name}():`, args[0].readUtf8String());
                console.log("  " + Thread.backtrace(this.context,
                    Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n  "));
            }
        });
    }
});
```

### Game Hacking - modify runtime behavior

```javascript
const takeDamage = Process.findModuleByName("game_binary").base.add(0x2a1c);
Interceptor.attach(takeDamage, {
    onEnter(args) {
        console.log(`[*] take_damage(${args[1].toInt32()}) - nullified`);
        args[1] = ptr(0);
    }
});
```

---

## Network Interception & Crypto Hooking

### TLS traffic decryption - hook below the encryption layer

```javascript
Interceptor.attach(Module.getGlobalExportByName("SSL_write"), {
    onEnter(args) {
        var len = args[2].toInt32();
        console.log("[SSL_write]", len, "bytes:");
        console.log(hexdump(args[1], { length: Math.min(len, 128) }));
    }
});
// Hook SSL_read's onLeave to see received plaintext
```

### Tools
- **friTap** (`pip install fritap`) - TLS key extraction for OpenSSL, BoringSSL, GnuTLS, WolfSSL, NSS, mbedTLS. Outputs PCAP + keylog files
- **frida-interception-and-unpinning** - rewrite apps for HTTPS MitM

### Crypto key extraction
Hook `EVP_EncryptInit_ex` to capture keys/IVs, `EVP_EncryptUpdate` to see plaintext.

Quick discovery: `frida-trace -i "*crypt*" -i "*cipher*" -i "*SSL*" ./target`

---

## CModule: Native Performance Hooks

For **hot functions** (malloc, free, tight loops), JavaScript hooks add too much overhead. CModule lets you write C code that compiles and runs at **native speed**:

```javascript
const cm = new CModule(`
  #include <gum/guminterceptor.h>
  #include <stdio.h>

  static int call_count = 0;

  void onEnter(GumInvocationContext * ic) {
    call_count++;
    if (call_count % 10000 == 0) {
      printf("[*] malloc called %d times\\n", call_count);
    }
  }
`);

Interceptor.attach(Module.getGlobalExportByName("malloc"), cm);
```

- ~100x faster than JavaScript callbacks on hot paths
- Full access to Gum C API (`gum/guminterceptor.h`, `gum/gumstalker.h`)
- Mix with JS: pass `NativePointer` data between CModule and JavaScript
- Trade-off: less convenient to write, no `console.log` (use `printf` instead)

Ideal for: `malloc`/`free` tracking (detect leaks, double-free, use-after-free), tight-loop instrumentation, and high-frequency syscall hooks. Use `Process.enumerateMallocRanges()` to scan the heap. See also **fridump** for full memory dumps.

---

## Frida Gadget: No Server Required

Can't set `ptrace_scope=0`? No root? Use **frida-gadget** instead:

```bash
# Method 1: LD_PRELOAD
LD_PRELOAD=/path/to/frida-gadget.so ./target_binary

# Method 2: Patch the binary permanently
patchelf --add-needed frida-gadget.so ./target_binary
```

The gadget is a shared library that runs Frida **inside** the target process:

| | frida-server | frida-gadget |
|---|---|---|
| **Requires root/ptrace** | Yes | No |
| **Separate daemon** | Yes (`frida-server`) | No (loads in-process) |
| **Attach to any PID** | Yes | Only the gadget-loaded process |
| **Setup** | Install + run server | Drop `.so` + configure |

### Gadget configuration (`frida-gadget.config`):

```json
{
  "interaction": {
    "type": "script",
    "path": "./my_hooks.js"
  }
}
```

Modes: `"listen"` (wait for client), `"script"` (auto-run), `"script-directory"` (load all scripts)

---

## Frida vs eBPF: When to Use Which

Both are dynamic analysis tools on Linux, but they serve **different purposes**:

| | Frida | eBPF / bpftrace |
|---|---|---|
| **Primary use** | Observe **and modify** | Observe only |
| **Scope** | Single process | System-wide |
| **Overhead** | Moderate (2-10x for hooks) | Very low (<5%) |
| **Safety** | Can crash target | Kernel-verified, crash-proof |
| **Granularity** | Function args, return values, memory | Tracepoints, kprobes, uprobes |
| **Scripting** | JavaScript (rich, interactive) | Limited C-like DSL |
| **Production** | Development/research | Production-safe monitoring |

### Rule of thumb:

- **Frida** when you need to **change behavior**: bypass checks, modify returns, inject code
- **eBPF** when you need to **observe at scale**: system-wide tracing, performance monitoring
- **Frida** for reverse engineering closed-source binaries
- **eBPF** for debugging and profiling systems you operate

```bash
# eBPF: trace all open() calls system-wide (observe)
bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s %s\n", comm, str(args.filename)); }'

# Frida: hook open() in one process and change the path (modify)
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) { args[0] = Memory.allocUtf8String("/tmp/fake"); }
});
```

---

## Python + RPC Exports: Building Real Tools

The `rpc.exports` pattern is the recommended way to build Python+Frida tools:

```javascript
// agent.js - runs inside the target
rpc.exports = {
    getModules() {
        return Process.enumerateModules().map(m => ({
            name: m.name, base: m.base.toString(), size: m.size
        }));
    },
    readString(addr) {
        return ptr(addr).readUtf8String();
    },
    hookFunction(name) {
        Interceptor.attach(Module.getGlobalExportByName(name), {
            onEnter(args) { send({ func: name, arg0: args[0].toString() }); }
        });
        return "Hooked " + name;
    }
};
```

---

## Python + RPC Exports: Building Real Tools (cont.)

```python
# host.py - orchestrates from Python
import frida

pid = frida.spawn(["./target"])
session = frida.attach(pid)
script = session.create_script(open("agent.js").read())
script.on('message', lambda msg, data: print(msg['payload']))
script.load()
frida.resume(pid)

# Call JS functions directly from Python!
modules = script.exports_sync.get_modules()
print(f"Found {len(modules)} modules")

result = script.exports_sync.hook_function("strcmp")
print(result)  # "Hooked strcmp"
```

RPC exports are cleaner than `send()`/`recv()` for structured communication.

---

## Loading and Calling Library Functions Directly

You don't always have a full program - sometimes you just have a `.so` and want to call its functions.

### Create a minimal harness

```c
// harness.c - loads a library so Frida can interact with it
#include <dlfcn.h>
#include <stdio.h>
#include <unistd.h>
int main(int argc, char *argv[]) {
    void *h = dlopen(argv[1], RTLD_NOW);
    if (!h) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 1; }
    printf("[harness] Loaded %s (PID: %d)\n", argv[1], getpid());
    pause();  // wait for Frida to attach
    return 0;
}
```

---

## Loading and Calling Library Functions Directly (cont.)

### Call library functions from Frida

```javascript
// Attach to harness, then call functions in the loaded library
var mod = Process.getModuleByName("libcrypto_custom.so");

var encrypt = new NativeFunction(
    mod.getExportByName("encrypt_data"),
    'int', ['pointer', 'int', 'pointer']
);

var input = Memory.allocUtf8String("secret data");
var output = Memory.alloc(256);
var result = encrypt(input, 11, output);
console.log("Encrypted:", hexdump(output, { length: 32 }));
```

```bash
gcc -o harness harness.c -ldl
frida -f ./harness -l call_lib.js -./libcrypto_custom.so
```

This pattern works for testing crypto libraries, fuzzing parsers, or analyzing plugins in isolation.

---

## Hooking C++ Functions

C++ **name mangling** makes hooking harder - but not impossible.

```bash
# C function:   check_password     → symbol: check_password
# C++ method:   Auth::check(std::string const&)
#               → symbol: _ZN4Auth5checkERKNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE
```

### Finding mangled names

```bash
nm ./cpp_binary | grep -i check           # find raw mangled symbol
nm --demangle ./cpp_binary | grep check   # see human-readable name
```

### Hooking by mangled name

```javascript
var mangled = "_ZN4Auth5checkERKNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE";
Interceptor.attach(Module.getGlobalExportByName(mangled), {
    onEnter(args) {
        // C++ member functions: args[0] = this, args[1..N] = real args
        console.log("[*] Auth::check() called");
        console.log("[*] this =", args[0]);
        console.log("[*] input =", readStdString(args[1]));
    },
    onLeave(retval) {
        retval.replace(1);  // bypass
    }
});
```

**Key rule:** For non-static member functions, `args[0]` is always the `this` pointer. Real parameters start at `args[1]`.

---

## Limitations and Language Challenges

### C++ pitfalls

| Challenge | Problem | Solution |
|---|---|---|
| **Name mangling** | Symbols like `_ZN3Foo3barEi` | `nm --demangle` to find, hook by mangled name |
| **`this` pointer** | Hidden first argument | `args[0]` is `this`, real args at `args[1]+` |
| **`std::string`** | Complex internal layout (SSO) | Read with helper function |
| **Virtual methods** | Called via vtable, address varies | Hook concrete implementation |
| **Templates** | Each instantiation has its own symbol | Hook each specialization individually |

### Frida's blind spots

| Target | Workaround |
|---|---|
| **Java (desktop JVM)** | Hook JNI native methods, or use `-javaagent` |
| **Go / Rust binaries** | Hook by address; `nm --demangle` for symbols |
| **Statically linked** | Hook by address; use `nm`/`objdump` for offsets |
| **Kernel code** | Use eBPF, kprobes, or SystemTap |
| **JIT-compiled code** | Stalker can trace, but hooking specific functions is hard |

### When Frida is the wrong tool:
- **System-wide monitoring** → use eBPF/bpftrace
- **Kernel debugging** → use ftrace, kprobes, or crash/drgn
- **Managed runtime introspection** → use runtime-specific tools (jdb, dotnet-trace)
- **Performance profiling** → use perf, Valgrind, or eBPF

---

## Resources for Continued Learning

### Official Resources
- **frida.re** - Official documentation, API reference, tutorials
- **Frida GitHub** - Source code, issues, examples
- **codeshare.frida.re** - Community-contributed scripts (SSL pinning bypass, anti-root bypass, etc.)

### Practice Platforms
- **crackmes.one** - Downloadable reverse engineering challenges
- **FridaLab** - 8 progressive Frida-specific challenges
- **OverTheWire Behemoth** - Linux binary exploitation wargame
- **picoCTF** - Beginner-friendly CTF with RE challenges

### Books and References
- **Practical Binary Analysis** by Dennis Andriesse
- **Learning Linux Binary Analysis** by Ryan "elfmaster" O'Neill
- **learnfrida.info** - The Frida Handbook (free online)

### For Serious Tool Development
- **TypeScript agents** - `npm install @types/frida-gum frida-compile` for type-safe scripts
- **frida-agent-example** - Official project template on GitHub (oleavr/frida-agent-example)

### Community
- **awesome-frida** on GitHub - Curated list of Frida resources
- **Frida Slack/Discord** - Community support
- **r/ReverseEngineering** - Reddit community

---

## Course Summary: The Progression

```
Level 1: Passive Observation
  file, readelf, strings
  "What IS this binary?"

Level 2: Shallow Dynamic Analysis
  ltrace, strace
  "What does it DO?"

Level 3: Static Analysis
  objdump, Ghidra
  "HOW does it work?"

Level 4: Dynamic Instrumentation (Frida)
  Interceptor.attach - observe
  "What happens at runtime?"

Level 5: Active Manipulation (Frida)
  retval.replace, Interceptor.replace
  "What if it did something DIFFERENT?"

Level 6: Full Automation
  Python + Frida scripts
  "Do it 10,000 times automatically"
```

You started this course running `file` on a binary.
You end it rewriting function return values at runtime.

> Binary reverse engineering is not about memorizing tools.
> It is about building a **mental model** of the target,
> layer by layer, using whatever tool gives you the next insight.

---

## Parting Advice

### The Complete Toolkit

| Tool | Purpose |
|---|---|
| **file, readelf, nm** | Basic binary identification |
| **strings** | Extract readable text |
| **ltrace / strace** | Trace library/system calls |
| **objdump** | Quick disassembly |
| **Ghidra** | Deep static analysis and decompilation |
| **Frida** | Dynamic instrumentation and hooking |
| **r2frida / Python + Frida** | Combined analysis and automation |

- **Start simple** - `strings` and `ltrace` solve more problems than you would expect
- **Combine static and dynamic** - Ghidra tells you **where** to hook, Frida tells you **what happens**
- **Practice on CTFs** - crackmes.one and picoCTF are excellent for building skills
- **Build your own tools** - the best way to learn Frida is to write scripts that solve real problems
- **Share with your LUG** - nothing solidifies knowledge like explaining it

---

## Q&A

### Questions, demos, and live hacking

```
     ____
    / _  |   Frida 17.x.x - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Thank you for attending!
   /_/ |_|
   . . . .
   . . . .   "Any sufficiently advanced instrumentation is
   . . . .    indistinguishable from magic."
   . . . .
```

### Contact and resources:
- Course materials: `github.com/your-lug/frida-course`
- Frida docs: `frida.re`
- Practice: `crackmes.one`
