---
title: "Frida Scripting - Modifying Behavior"
theme: default
paginate: true
---

# Frida Scripting
## Modifying Behavior

### From observation to manipulation

---

## Loading Scripts from Files

So far: typing into the REPL. For real work, use **script files**.

```bash
# Spawn the binary and load a script
frida -f ./binary -l script.js --no-pause

# Attach to a running process with a script
frida -p 1234 -l script.js

# By name
frida process_name -l script.js
```

`--no-pause` automatically resumes the process after loading the script.
Without it, the process stays paused and you must type `%resume`.

Your script is a plain `.js` file - no special boilerplate required.

---

## Script Structure and Lifecycle

A Frida script is just JavaScript that runs inside the target process:

```javascript
// script.js

// 1. Setup phase - runs immediately when the script is loaded
console.log("[*] Script loaded. PID:", Process.id);

// 2. Hook installation - set up your interceptors
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("[strcmp]", args[0].readUtf8String(),
                     "vs", args[1].readUtf8String());
    }
});

// 3. The script stays resident - hooks fire as the process runs
console.log("[*] Hooks installed. Waiting for calls...");
```

Key points:
- Code runs **top to bottom** when loaded
- Hooks persist until the script is unloaded or the process exits
- `console.log()` output appears in your terminal

---

## Interceptor.attach: onEnter and onLeave

Every `Interceptor.attach()` can have two callbacks:

```javascript
Interceptor.attach(targetAddress, {
    // Called BEFORE the function body executes
    onEnter(args) {
        // args[0], args[1], ... are the function's parameters
    },

    // Called AFTER the function returns
    onLeave(retval) {
        // retval is the return value (NativePointer)
    }
});
```

`onEnter` sees what **goes in**. `onLeave` sees what **comes out**.

And here is the critical part: in `onLeave`, you can **change** the return value.

---

## Sharing Data Between onEnter and onLeave

Use `this` to pass data from `onEnter` to `onLeave`:

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        // Save arguments for use in onLeave
        this.s1 = args[0].readUtf8String();
        this.s2 = args[1].readUtf8String();
        console.log(`strcmp("${this.s1}", "${this.s2}")`);
    },
    onLeave(retval) {
        // this.s1 and this.s2 are available here
        console.log(`  => returned ${retval.toInt32()}`);
        console.log(`  (was comparing: "${this.s1}" vs "${this.s2}")`);
    }
});
```

`this` is an **invocation context** - unique per call, so concurrent calls
do not interfere with each other.

---

## The Power Move: Replacing Return Values

`retval.replace()` changes the return value **before the caller sees it**.

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        this.s1 = args[0].readUtf8String();
        this.s2 = args[1].readUtf8String();
        console.log(`strcmp("${this.s1}", "${this.s2}")`);
    },
    onLeave(retval) {
        retval.replace(0);  // Force strcmp to return 0 (strings match)
        console.log("  => forced return 0 (match)");
    }
});
```

`strcmp` returns `0` when strings are **equal**.

By forcing the return value to `0`, we make the program think
**every string comparison succeeds** - no matter what the user typed.

---

## The "Aha" Moment

```bash
$ frida -f exercises/bin/ex01_password_check -l bypass.js --no-pause
```

```
Enter password: i_have_no_idea
strcmp("i_have_no_idea", "Sup3rS3cr3t!")
  => forced return 0 (match)
Access granted! Welcome!
```

We bypassed the password check **without knowing the password**.

This is the fundamental shift:
- **Static analysis** tells you what code *says*
- **Dynamic instrumentation** lets you change what code *does*

We did not patch the binary. We did not modify any file on disk.
We intercepted a function call in flight and rewrote reality.

---

## Being Selective with Hooks

Forcing *all* strcmp calls to return 0 is a sledgehammer.
Be surgical when needed:

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        this.s1 = args[0].readUtf8String();
        this.s2 = args[1].readUtf8String();

        // Only tamper when we see the password check
        this.shouldBypass = this.s2 === "Sup3rS3cr3t!";

        if (this.shouldBypass) {
            console.log(`[!] Password check detected: "${this.s1}" vs "${this.s2}"`);
        }
    },
    onLeave(retval) {
        if (this.shouldBypass) {
            retval.replace(0);
            console.log("[!] Bypassed!");
        }
        // All other strcmp calls proceed normally
    }
});
```

---

## Memory Operations: Reading Raw Bytes

### hexdump - inspect memory visually

```javascript
var addr = Module.getGlobalExportByName("strcmp");
console.log(hexdump(addr, {
    offset: 0,
    length: 64,
    header: true,
    ansi: true
}));
```

Output:
```
           0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  f3 0f 1e fa 48 89 f8 48 89 f1 48 83 e0 3f 48 83  ....H..H..H..?H.
00000010  f8 30 77 1b 48 83 e1 3f 48 83 f9 30 77 11 eb 14  .0w.H..?H..0w...
```

### NativePointer.readByteArray - read raw bytes

```javascript
var buf = addr.readByteArray(32);
console.log(buf);  // ArrayBuffer with 32 bytes
```

---

## Memory Operations: Allocating and Writing

### Allocate a new string in the target's memory

```javascript
var greeting = Memory.allocUtf8String("Hello from Frida!");
console.log(greeting);                  // NativePointer address
console.log(greeting.readUtf8String()); // "Hello from Frida!"
```

### Scan memory for byte patterns

```javascript
// Search for the string "password" in the main module
var mod = Process.enumerateModules()[0];
var matches = Memory.scanSync(mod.base, mod.size, "70 61 73 73 77 6f 72 64");
for (var m of matches) {
    console.log("[*] Found 'password' at:", m.address);
    console.log("    Context:", m.address.readUtf8String());
}
console.log("[*] Scan complete. Found", matches.length, "matches.");
```

The pattern is hex bytes. You can use `??` as wildcards: `"48 8b ?? 10"`.

---

## NativeFunction: Calling Native Code from JavaScript

Create a JavaScript wrapper around any native function:

```javascript
// Signature: int puts(const char *s);
const puts = new NativeFunction(
    Module.getGlobalExportByName("puts"),
    'int',           // return type
    ['pointer']      // argument types
);

// Now call it - inject our own output into the target process!
var msg = Memory.allocUtf8String("Hello from Frida!");
puts(msg);
```

This calls the **real** `puts` inside the target process.
The text appears in the target's stdout.

---

## NativeFunction: More Examples

```javascript
// int printf(const char *format, ...);
const printf = new NativeFunction(
    Module.getGlobalExportByName("printf"),
    'int',
    ['pointer', '...', 'int', 'pointer']  // variadic args
);

// void *malloc(size_t size);
const malloc = new NativeFunction(
    Module.getGlobalExportByName("malloc"),
    'pointer',
    ['size_t']
);

// void free(void *ptr);
const free = new NativeFunction(
    Module.getGlobalExportByName("free"),
    'void',
    ['pointer']
);

// Allocate memory the "real" way
var buf = malloc(256);
console.log("Allocated buffer at:", buf);
free(buf);
```

---

## Interceptor.replace: Full Function Replacement

Replace a function's **entire implementation**:

```javascript
// Original: int check_license(const char *key)
// Returns 1 for valid, 0 for invalid

const check_license = Module.getGlobalExportByName("check_license");

Interceptor.replace(check_license,
    new NativeCallback(function (keyPtr) {
        var key = keyPtr.readUtf8String();
        console.log("[*] check_license called with:", key);
        console.log("[*] Returning 1 (valid) regardless");
        return 1;  // Always valid!
    }, 'int', ['pointer'])
);
```

- `Interceptor.attach` = wrap the original (it still runs)
- `Interceptor.replace` = **substitute** the original (it never runs)

Use `replace` when you want to completely redefine behavior.

---

## The Message API: send() and recv()

For complex tools, your Frida script can communicate with a **Python** host:

### JavaScript side (inside the target):

```javascript
// Send data to the Python script
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        send({
            type: "strcmp",
            s1: args[0].readUtf8String(),
            s2: args[1].readUtf8String()
        });
    }
});
```

### Python side (on your machine):

```python
def on_message(message, data):
    if message['type'] == 'send':
        payload = message['payload']
        print(f"strcmp: {payload['s1']} vs {payload['s2']}")

script.on('message', on_message)
```

This separation lets you do heavy processing in Python while
keeping the in-process hook lightweight.

---

## Backtraces: Who Called This Function?

`Thread.backtrace()` shows the **call chain** that led to the current function:

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("strcmp called from:");
        console.log(
            Thread.backtrace(this.context, Backtracer.ACCURATE)
                .map(DebugSymbol.fromAddress)
                .join("\n  ")
        );
    }
});
```

Output:
```
strcmp called from:
  0x5555555551a3 ex01_password_check!check_password+0x23
  0x555555555210 ex01_password_check!main+0x40
  0x7ffff7c29d90 libc.so.6!__libc_start_call_main+0x80
```

Invaluable for understanding **where** a function is called from,
especially in large binaries.

---

## Backtraces: Practical Use Cases

### "Why is this file being opened?"

```javascript
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) {
        var path = args[0].readUtf8String();
        if (path.includes(".conf") || path.includes("license")) {
            console.log("\n[*] Interesting open:", path);
            console.log("    Called from:");
            console.log("   ",
                Thread.backtrace(this.context, Backtracer.ACCURATE)
                    .map(DebugSymbol.fromAddress)
                    .join("\n    ")
            );
        }
    }
});
```

This tells you **which function** in the binary is responsible for
reading a particular file - without reading a single line of disassembly.

---

## Modifying Function Arguments

You can change arguments **before** the function sees them:

```javascript
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) {
        var path = args[0].readUtf8String();
        if (path === "/etc/license.dat") {
            // Redirect to our fake license file
            var fakePath = Memory.allocUtf8String("/tmp/fake_license.dat");
            args[0] = fakePath;
            console.log("[*] Redirected open: /etc/license.dat -> /tmp/fake_license.dat");
        }
    }
});
```

The function receives **our modified argument** and has no idea.

Useful for:
- Redirecting file access
- Changing network destinations
- Injecting custom data

---

## Complete Example Scripts

Each exercise has a full solution in `exercises/solutions/`. Here are the key patterns:

### ex04_bypass_password.js - Force strcmp to match

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        try { this.s1 = args[0].readUtf8String(); } catch(e) { this.s1 = null; }
    },
    onLeave(retval) {
        if (this.s1 !== null) retval.replace(0);  // 0 = strings match
    }
});
```

### ex04_bypass_license.js - Force validation to return true

```javascript
Interceptor.attach(Module.getGlobalExportByName("check_license"), {
    onLeave(retval) {
        retval.replace(1);  // 1 = valid license
    }
});
```

---

## Complete Example Scripts (cont.)

### modify_score.js - Multiply points via argument rewrite

```javascript
Interceptor.attach(Module.getGlobalExportByName("update_score"), {
    onEnter(args) {
        var points = args[1].toInt32();
        args[1] = ptr(points * 100);  // 100x score multiplier
    }
});
```

Same pattern every time: **hook, inspect, replace**.

---

## Script Development Workflow

1. **Write** `script.js` in your editor
2. **Run**: `frida -f ./target -l script.js --no-pause`
3. **Observe** output, tweak, **Ctrl+C**, re-run
4. **Hot reload** (no restart): type `%reload` in the Frida REPL

**Debug liberally** with `console.log` and `hexdump`:

```javascript
console.log("[DEBUG] args[0] =", args[0]);
console.log("[DEBUG] hex dump:\n" + hexdump(args[0], {length: 32}));
```

---

## Common Patterns

### Reusable hook helper

```javascript
function hookExport(name, onEnterFn) {
    var addr = Module.getGlobalExportByName(name);
    if (addr) Interceptor.attach(addr, { onEnter: onEnterFn });
}

hookExport("strcmp", function(args) {
    console.log("strcmp:", args[0].readUtf8String(), "vs", args[1].readUtf8String());
});
```

### Conditional bypass

```javascript
function conditionalBypass(funcName, condition, forceRetval) {
    Interceptor.attach(Module.getGlobalExportByName(funcName), {
        onEnter(args) { this.shouldBypass = condition(args); },
        onLeave(retval) {
            if (this.shouldBypass) retval.replace(forceRetval);
        }
    });
}

conditionalBypass("strcmp",
    (args) => { try { return args[1].readUtf8String().includes("S3cr3t"); } catch(e) { return false; } },
    0  // strcmp returns 0 for match
);
```

---

## Exercise: Bypass the License Checker (15 min)

**Target:** `exercises/bin/ex04_license_check`
**Goal:** Write a Frida script that makes the license checker accept any key.

**Techniques to use:**
- `Interceptor.attach` with `onLeave` → `retval.replace()`
- Hooking validation functions by export name
- Tracing with `frida-trace` to find the right function

See **`exercises/ex04-frida-bypass.md`** for full instructions and solution.

---

## Exercise: Modify Game Scores (10 min)

**Target:** `exercises/bin/ex05_game_score`
**Goal:** Cheat the scoring system - multiply points, hook `rand()`, or write directly to memory.

**Techniques to use:**
- Argument modification in `onEnter`
- `NativeFunction` to call scoring functions directly
- `retval.replace()` on `rand()` for predictable outcomes

See **`exercises/ex05-frida-game-hack.md`** for full instructions and solution.

---

## Common Pitfalls and Debugging

### Memory safety
- **Dangling pointers**: Copy data in `onEnter`, don't read stale pointers in `onLeave`
  ```javascript
  onEnter(args) { this.path = args[0].readUtf8String(); }  // copy now
  onLeave(retval) { console.log(this.path); }               // safe
  ```
- **GC of Memory.alloc**: Keep a global reference if native code stores the pointer
  ```javascript
  var keepAlive = [];  // prevent garbage collection
  var buf = Memory.allocUtf8String("fake");
  keepAlive.push(buf);
  ```

### Debugging hooks
- **Catch crashes**: `Process.setExceptionHandler(details => { console.log(JSON.stringify(details)); return false; });`
- **Guard pointer reads**: Wrap `readUtf8String()` in `try/catch` - not all `args[0]` are valid strings
- **hexdump() for raw data**: `console.log(hexdump(args[0], { length: 64 }));`

### Performance
- Avoid hooking `malloc`/`free`/`memcpy` with JavaScript - use CModule (Module 8)
- Buffer `send()` messages - each one is a cross-process IPC call
- `Module.getGlobalExportByName()` is expensive - cache the result in a variable

### ASLR
- **Never hardcode addresses** from a disassembler - use `Process.findModuleByName("target").base.add(offset)`

---

## Recap

| Concept | What It Does |
|---|---|
| `frida -l script.js` | Load a hook script from a file |
| `retval.replace(val)` | Change a function's return value |
| `this.x` in onEnter/onLeave | Share data between entry and exit hooks |
| `Memory.allocUtf8String()` | Create new strings in target memory |
| `hexdump()` / `Memory.scanSync()` | Inspect and search target memory |
| `new NativeFunction()` | Call any native function from JavaScript |
| `Interceptor.replace()` | Completely replace a function |
| `send()` / `on('message')` | Communicate with a Python host script |
| `Thread.backtrace()` | See who called the current function |

### Next up: Advanced techniques - stripped binaries, Stalker tracing, Python automation.
