# Exercise 3: Your First Frida Hook

**Duration:** ~15 minutes
**Tools:** frida, frida-trace
**Target:** `exercises/bin/ex01_password_check`

## Part A: frida-trace (the easy way)

### Step 1: Trace strcmp calls

```bash
frida-trace -f ./exercises/bin/ex01_password_check -i "strcmp"
```

When the binary prompts for a password, type anything and press Enter.
You should see the `strcmp` call logged.

### Step 2: Customize the handler

frida-trace created a file in `__handlers__/libc.so.6/strcmp.js`. Edit it:

```javascript
{
  onEnter(log, args, state) {
    log('strcmp("' + args[0].readUtf8String() + '", "' + args[1].readUtf8String() + '")');
  },
  onLeave(log, retval, state) {
    log('  => ' + retval);
  }
}
```

Re-run frida-trace. Now you'll see the actual string arguments!

## Part B: Frida REPL (interactive mode)

### Step 1: Attach to the binary

In one terminal, run:
```bash
./exercises/bin/ex01_password_check
```

In another terminal:
```bash
frida ex01_password_check
```

### Step 2: Explore in the REPL

```javascript
// List loaded modules
Process.enumerateModules().forEach(m => console.log(m.name, m.base));

// Find strcmp
Module.getGlobalExportByName("strcmp")

// Find our custom function
Module.getGlobalExportByName("check_password")

// List all exports containing "check"
Module.enumerateExports("ex01_password_check").filter(e => e.name.includes("check"))
```

### Step 3: Hook strcmp in the REPL

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("strcmp:", args[0].readUtf8String(), "vs", args[1].readUtf8String());
    }
});
```

Now go back to the first terminal and enter a password. Watch the Frida REPL!

## Part C: Writing a script file

### Step 1: Create ex03_hook_password.js

```javascript
// ex03_hook_password.js
console.log("[*] Script loaded, hooking strcmp...");

Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter: function(args) {
        var s1 = args[0].readUtf8String();
        var s2 = args[1].readUtf8String();
        console.log("[strcmp] '" + s1 + "' vs '" + s2 + "'");
    },
    onLeave: function(retval) {
        console.log("[strcmp] returned: " + retval);
    }
});
```

### Step 2: Run with the script

```bash
frida -f ./exercises/bin/ex01_password_check --no-pause -l ex03_hook_password.js
```

## Challenge

Can you also hook `check_password` to see its return value?

```javascript
Interceptor.attach(Module.getGlobalExportByName("check_password"), {
    onEnter(args) {
        console.log("[check_password] input:", args[0].readUtf8String());
    },
    onLeave(retval) {
        console.log("[check_password] returned:", retval.toInt32());
    }
});
```

## What You Learned

- `frida-trace` auto-generates hooks for any function
- The Frida REPL lets you explore a running process interactively
- `Interceptor.attach()` hooks function entry and exit
- `args[N].readUtf8String()` reads string arguments
- `retval.toInt32()` reads integer return values
