# Exercise 6: Bypassing Anti-Debugging

**Duration:** ~10 minutes
**Tools:** frida, strace
**Target:** `exercises/bin/ex06_anti_debug`

## Background

Many programs use anti-debugging techniques to prevent analysis. The most common
on Linux is calling `ptrace(PTRACE_TRACEME)` - if a debugger is already attached,
this call fails.

## Step 1: Run normally

```bash
./exercises/bin/ex06_anti_debug
```

You should see the secret flag printed.

## Step 2: Try strace

```bash
strace ./exercises/bin/ex06_anti_debug
```

strace uses ptrace, so the anti-debug check triggers:
```
ptrace(PTRACE_TRACEME) = -1 EPERM
write(1, "Debugger detected! Exiting.\n", ...)
```

The program detects strace and exits!

## Step 3: Try ltrace

```bash
ltrace ./exercises/bin/ex06_anti_debug
```

Same problem - ltrace also uses ptrace.

## Step 4: Bypass with Frida

Frida injects code but doesn't keep a ptrace attachment, so the basic check won't
trigger. But let's bypass it explicitly to learn the technique:

Create `ex06_bypass_antidebug.js`:

```javascript
// ex06_bypass_antidebug.js
console.log("[*] Anti-debug bypass loaded");

Interceptor.replace(
    Module.getGlobalExportByName("ptrace"),
    new NativeCallback(function(request, pid, addr, data) {
        console.log("[*] ptrace(" + request + ") intercepted, returning 0");
        return 0;  // Success - no debugger detected
    }, 'long', ['int', 'int', 'pointer', 'pointer'])
);

console.log("[*] ptrace() is now neutralized");
```

## Step 5: Run with bypass

```bash
frida -f ./exercises/bin/ex06_anti_debug --no-pause -l ex06_bypass_antidebug.js
```

The anti-debug check is bypassed and you see the secret flag!

## Why This Matters

Real-world malware and protected software use anti-debugging:
- `ptrace(PTRACE_TRACEME)` - the simplest check
- Reading `/proc/self/status` for TracerPid
- Timing checks (debugging slows execution)
- Checking for known debugger processes

Frida can bypass all of these because it works differently from traditional debuggers.

## Challenge: What if the binary was stripped?

If `ptrace` wasn't found by name, you could:

```javascript
// Find ptrace by its syscall number (SYS_ptrace = 101 on x86_64)
// Hook the raw syscall instead
var syscallAddr = Module.getGlobalExportByName("syscall");
Interceptor.attach(syscallAddr, {
    onEnter(args) {
        if (args[0].toInt32() === 101) {  // SYS_ptrace
            console.log("[*] ptrace syscall intercepted");
            this.isPtrace = true;
        }
    },
    onLeave(retval) {
        if (this.isPtrace) {
            retval.replace(ptr(0));
            this.isPtrace = false;
        }
    }
});
```

## What You Learned

- Anti-debugging is a common protection technique
- `ptrace(PTRACE_TRACEME)` is the most basic Linux anti-debug
- strace and ltrace are ptrace-based and get detected
- Frida can bypass ptrace checks by replacing the function
- This technique applies to any anti-analysis check
