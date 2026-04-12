# Exercise 8: Anti-Debug Bypass

## Objective
Use Frida to bypass anti-debugging protections in a binary that actively resists analysis.

## Background
The `ex06_anti_debug` binary from Exercise 6 uses `ptrace(PTRACE_TRACEME)` to detect debuggers. In this exercise, you'll write a more comprehensive bypass script.

## Target
`exercises/bin/ex06_anti_debug`

## The Defenses
The binary uses `ptrace(PTRACE_TRACEME)` - if a debugger is already attached, ptrace fails and the binary exits.

Frida has an advantage: it uses **code injection**, not ptrace, so the basic check doesn't detect it. But the binary still calls `ptrace` to set a flag.

## Steps

### Step 1: Observe the binary normally

```bash
./exercises/bin/ex06_anti_debug
# Should print a flag if no debugger is detected
```

### Step 2: Hook ptrace to understand the check

```javascript
// observe_ptrace.js
Interceptor.attach(Module.getGlobalExportByName("ptrace"), {
    onEnter(args) {
        var request = args[0].toInt32();
        console.log("[*] ptrace(" + request + ") called");
        // PTRACE_TRACEME = 0
        if (request === 0) {
            console.log("[*]   -> PTRACE_TRACEME detected!");
        }
    },
    onLeave(retval) {
        console.log("[*]   -> returned: " + retval.toInt32());
    }
});
```

### Step 3: Bypass by replacing the return value

```javascript
// bypass_ptrace.js
Interceptor.attach(Module.getGlobalExportByName("ptrace"), {
    onEnter(args) {
        this.isPtraceTraceme = args[0].toInt32() === 0;
    },
    onLeave(retval) {
        if (this.isPtraceTraceme) {
            console.log("[*] Bypassing PTRACE_TRACEME check");
            retval.replace(0);  // 0 = success
        }
    }
});
```

### Step 4: Run it

```bash
frida -f exercises/bin/ex06_anti_debug -l bypass_ptrace.js --no-pause
```

## Challenge
1. Run the binary and observe its behavior
2. Hook `ptrace` and observe the anti-debug check
3. Write a bypass that makes `ptrace(PTRACE_TRACEME)` return success
4. Capture the hidden flag: `CTF{n0_debug_n0_pr0blem}`

## Bonus Challenge
Can you also hook `exit()` to prevent the binary from terminating if the check fails?

## Solution
See `exercises/solutions/ex08_bypass_ptrace.js`
