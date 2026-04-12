# Exercise 7: Hooking a Stripped Binary

## Objective
Hook a function in a binary that has been **stripped** of symbols, using address-based hooking.

## Background
When symbols are removed (`strip` command), `Module.getGlobalExportByName()` can't find internal functions. You must:
1. Find the function offset using static analysis (`objdump`, `nm`, or Ghidra)
2. Calculate the runtime address using the module's base address

## Target
`exercises/bin/ex01_password_check` (we'll use the same binary, but pretend it's stripped)

## Steps

### Step 1: Find the function offset

```bash
# Find check_password function offset
objdump -d exercises/bin/ex01_password_check | grep -A5 "check_password"
# Note the address (e.g., 0x1189 - your offset may differ)

# Or use nm:
nm exercises/bin/ex01_password_check | grep check_password
```

### Step 2: Hook by address

```javascript
// hook_by_address.js
var mod = Process.findModuleByName("ex01_password_check");
console.log("[*] Module base: " + mod.base);

// Replace 0x1189 with YOUR offset from objdump
var offset = 0x1189;
var funcAddr = mod.base.add(offset);
console.log("[*] Hooking at: " + funcAddr);

Interceptor.attach(funcAddr, {
    onEnter(args) {
        console.log("[*] check_password called!");
        console.log("[*] Argument: " + args[0].readUtf8String());
    },
    onLeave(retval) {
        console.log("[*] Return value: " + retval.toInt32());
        retval.replace(1);  // Force success
        console.log("[*] Replaced with: 1");
    }
});
```

### Step 3: Run it

```bash
frida -f exercises/bin/ex01_password_check -l hook_by_address.js
```

## Challenge
1. Find the offset of `check_password` using `objdump -d`
2. Write a Frida script that hooks it by address
3. Bypass the password check without knowing the password

## Solution
See `exercises/solutions/ex07_hook_by_address.js`
