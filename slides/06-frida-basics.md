---
title: "Frida Basics and First Hooks"
theme: default
paginate: true
---

# Frida Basics and First Hooks

### From observer to interceptor

---

## Frida's Two Modes of Operation

Frida can attach to a running process **or** spawn a new one under its control.

### Spawn mode - start a process under Frida's supervision

```bash
frida -f ./binary
```

- Frida spawns the process **paused** (before `main()` runs)
- You get a chance to set up hooks before any code executes
- Use `%resume` in the REPL (or `--no-pause`) to continue execution

### Attach mode - hook into something already running

```bash
frida -p 1234          # attach by PID
frida process_name     # attach by name
```

- Process is already running - you may miss early initialization
- Useful for long-running services, daemons, GUI applications

---

## Spawn vs Attach: When to Use Which

| | Spawn (`-f`) | Attach (`-p` / name) |
|---|---|---|
| **Timing** | Before `main()` | Mid-execution |
| **Use case** | Short-lived binaries, CTFs | Services, daemons, GUIs |
| **Hook coverage** | Full - nothing runs before you | Partial - early code already ran |
| **Example** | `frida -f ./crackme` | `frida nginx` |

**Rule of thumb:** If you control when the process starts, use spawn.
If it is already running (or must stay running), use attach.

---

## The Frida REPL

When you attach or spawn, Frida drops you into an **interactive JavaScript console**
that runs *inside the target process*.

```
     ____
    / _  |   Frida 16.x.x - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/

[Local::./ex01_password_check ]->
```

Everything you type here executes as JavaScript **in the target's address space**.

---

## Key Concepts: The Frida API

Four pillars you will use constantly:

### `Process`
Information about the running process - PID, architecture, modules, threads.

### `Module`
Inspect loaded shared libraries - find exports, base addresses, symbols.

### `Memory`
Read and write raw bytes in the target's address space.

### `Interceptor`
The hook engine - intercept function calls, read arguments, modify return values.

---

## First Hook: frida-trace

`frida-trace` is the fastest way to start intercepting function calls.
No scripting required - just tell it what to trace.

```bash
# Trace all calls to strcmp in our password checker
frida-trace -f ./ex01_password_check -i "strcmp"
```

Output:

```
Instrumenting...
strcmp: Auto-generated handler at
  "__handlers__/libc.so.6/strcmp.js"
Started tracing 1 function.
           /* TID 0x1a3f */
  3245 ms  strcmp()
```

The `-i` flag matches **exported function names** (supports wildcards: `-i "str*"`).

---

## frida-trace: Auto-Generated Handlers

frida-trace creates JavaScript handler files you can inspect and edit:

```
__handlers__/
  libc.so.6/
    strcmp.js
```

Default generated handler:

```javascript
// __handlers__/libc.so.6/strcmp.js
{
  onEnter(log, args, state) {
    log('strcmp()');
  },

  onLeave(log, retval, state) {
  }
}
```

This is a **live file** - edit it and frida-trace will hot-reload your changes.

---

## Customizing frida-trace Handlers

Edit `__handlers__/libc.so.6/strcmp.js` to print the actual arguments:

```javascript
{
  onEnter(log, args, state) {
    // args[0] and args[1] are NativePointer objects
    // .readUtf8String() dereferences the pointer and reads a C string
    var s1 = args[0].readUtf8String();
    var s2 = args[1].readUtf8String();
    log('strcmp("' + s1 + '", "' + s2 + '")');
  },

  onLeave(log, retval, state) {
    log('  => returned ' + retval.toInt32());
  }
}
```

Save the file. frida-trace detects the change and reloads automatically.

Now every `strcmp` call shows you **what** is being compared.

---

## frida-trace: Seeing Secrets

After editing the handler, restart the trace:

```bash
frida-trace -f ./ex01_password_check -i "strcmp"
```

When the binary asks for a password and you type "hello":

```
  1042 ms  strcmp("hello", "Sup3rS3cr3t!")
             => returned -1
```

The secret password is right there: **`Sup3rS3cr3t!`**

The binary compared our input against the hardcoded password using `strcmp`.
Frida let us watch it happen in real time.

---

## Module Exploration in the REPL

Attach to a process and explore what is loaded:

```javascript
// List all loaded modules (shared libraries + the binary itself)
Process.enumerateModules()
// => [{name: "ex01_password_check", base: "0x55a000", size: 16384, path: "/home/..."},
//     {name: "libc.so.6", base: "0x7f3a00", size: 2097152, path: "/usr/lib/..."},
//     ...]
```

```javascript
// Find the address of a specific exported function
Module.getGlobalExportByName("strcmp")
// => "0x7f3a001b2f0"
// searches all loaded modules for the export
```

```javascript
// Enumerate exports and filter for string-related functions
Module.enumerateExports("libc.so.6")
    .filter(e => e.name.includes("str"))
// => [{type: "function", name: "strcmp", address: "0x7f3a..."},
//     {type: "function", name: "strcpy", address: "0x7f3a..."},
//     {type: "function", name: "strlen", address: "0x7f3a..."},
//     ...]
```

---

## More Module Exploration

```javascript
// Find the base address of the main binary
Process.enumerateModules()[0]
// => {name: "ex01_password_check", base: "0x5555555000", size: 16384, ...}

// Or find it by name
Process.findModuleByName("ex01_password_check").base
// => "0x5555555000"
```

```javascript
// List imports - what functions does the binary pull from shared libs?
Module.enumerateImports("ex01_password_check")
// => [{type: "function", name: "strcmp", module: "libc.so.6", address: "0x7f..."},
//     {type: "function", name: "printf", module: "libc.so.6", address: "0x7f..."},
//     {type: "function", name: "puts",   module: "libc.so.6", address: "0x7f..."},
//     ...]
```

This gives you a **map** of the binary's external dependencies without
touching a disassembler.

---

## Your First Interceptor.attach()

`Interceptor.attach()` is the core hooking API. Paste this into the REPL:

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("strcmp(",
            args[0].readUtf8String(),
            ",",
            args[1].readUtf8String(),
            ")");
    }
});
```

- `Module.getGlobalExportByName("strcmp")` - resolves the address of `strcmp`
- `onEnter(args)` - called **every time** `strcmp` is entered
- `args[0]`, `args[1]` - `NativePointer` objects pointing to the function arguments

This is the **programmatic equivalent** of what frida-trace does,
but now you have full control.

```javascript
// You can also intercept the return:
Interceptor.attach(target, {
    onEnter(args) { /* called when function starts */ },
    onLeave(retval) {
        console.log("returned:", retval.toInt32());
    }
});
```

We'll use `onLeave` extensively in Module 7 to modify return values.

---

## Reading Function Arguments

Every `args[N]` is a **NativePointer** - Frida's wrapper around a raw memory address.
You call methods on it to read what it points to.

You convert it depending on the argument type:

### Strings (char *)
```javascript
args[0].readUtf8String()       // Read a null-terminated UTF-8 string
args[0].readCString()          // Read a null-terminated C string
args[0].readUtf8String(16)     // Read at most 16 bytes
```

### Integers
```javascript
args[0].toInt32()              // Signed 32-bit integer
args[0].toUInt32()             // Unsigned 32-bit integer
```

### Pointers / addresses
```javascript
args[0]                        // Already a NativePointer - prints as hex
args[0].readPointer()          // Dereference: read the pointer it points to
```

### Raw bytes
```javascript
// hexdump() - built-in Frida utility for hex+ASCII memory dumps
console.log(hexdump(args[0], { length: 64 }))
// Options: length, offset, header (bool), ansi (bool for colors)
```

---

## Matching Arguments to the C Prototype

Always think about the C function signature:

```c
// man strcmp
int strcmp(const char *s1, const char *s2);
```

| C parameter | Frida argument | How to read |
|---|---|---|
| `const char *s1` | `args[0]` | `args[0].readUtf8String()` |
| `const char *s2` | `args[1]` | `args[1].readUtf8String()` |
| return `int` | `retval` (in onLeave) | `retval.toInt32()` |

```c
// man open
int open(const char *pathname, int flags);
```

| C parameter | Frida argument | How to read |
|---|---|---|
| `const char *pathname` | `args[0]` | `args[0].readUtf8String()` |
| `int flags` | `args[1]` | `args[1].toInt32()` |

The **calling convention** and architecture determine how args map.
On x86_64 Linux: `args[0]` = RDI, `args[1]` = RSI, `args[2]` = RDX, ...

---

## Hooking Multiple Functions

You can set up as many hooks as you want:

```javascript
// Hook strcmp
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("[strcmp]", args[0].readUtf8String(),
                     "vs", args[1].readUtf8String());
    }
});

// Hook puts - see what the program prints
Interceptor.attach(Module.getGlobalExportByName("puts"), {
    onEnter(args) {
        console.log("[puts]", args[0].readUtf8String());
    }
});

// Hook open - see what files it accesses
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) {
        console.log("[open]", args[0].readUtf8String(),
                     "flags:", args[1].toInt32());
    }
});
```

---

## Practical Tips

### Avoid crashing the target

Some pointers may be invalid. Guard your reads:

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        try {
            console.log("strcmp:", args[0].readUtf8String(),
                         "vs", args[1].readUtf8String());
        } catch (e) {
            console.log("strcmp: <couldn't read args>");
        }
    }
});
```

### Filtering noise

libc functions get called thousands of times. Filter to what matters:

```javascript
onEnter(args) {
    var s = args[0].readUtf8String();
    if (s && s.includes("password")) {
        console.log("Interesting strcmp:", s, "vs", args[1].readUtf8String());
    }
}
```

---

## Quick Reference: Common frida-trace Patterns

```bash
# Trace a single function
frida-trace -f ./binary -i "strcmp"

# Trace all string functions
frida-trace -f ./binary -i "str*"

# Trace file operations
frida-trace -f ./binary -i "open" -i "read" -i "write" -i "close"

# Trace functions in a specific library
frida-trace -f ./binary -I "libcrypto*"

# Trace by address (for non-exported functions)
frida-trace -f ./binary -a "binary!0x1234"

# Attach to a running process
frida-trace -p $(pidof target) -i "strcmp"
```

---

## Exercise: Find the Password (15 min)

**Target:** `exercises/bin/ex01_password_check`
**Goal:** Use frida-trace and Interceptor.attach to discover the hardcoded password - without reading the source code.

**What you will practice:**
- Running `frida-trace` with function filters
- Editing auto-generated handler files
- Reading function arguments at runtime

See **`exercises/ex03-frida-first-hook.md`** for step-by-step instructions and solution.

---

## Recap

| Concept | What It Does |
|---|---|
| `frida -f ./bin` | Spawn a process under Frida |
| `frida -p PID` | Attach to a running process |
| `frida-trace -i "func"` | Quick function tracing with auto-generated handlers |
| `Process.enumerateModules()` | List loaded libraries |
| `Module.getGlobalExportByName()` | Resolve a function's address across all modules |
| `Interceptor.attach()` | Hook a function - read args on entry |
| `args[N].readUtf8String()` | Read a C string argument |
| `args[N].toInt32()` | Read an integer argument |

### Next up: Modifying behavior - not just watching, but *changing* what functions return.
