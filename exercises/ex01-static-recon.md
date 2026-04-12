# Exercise 1: Static Reconnaissance

**Duration:** ~10 minutes
**Tools:** file, strings, readelf, nm, objdump
**Target:** `exercises/bin/ex01_password_check`

## Objective

Use static analysis tools to gather as much information as possible about a binary
*without* executing it.

## Steps

### Step 1: Identify the binary

```bash
file exercises/bin/ex01_password_check
```

**Questions:**
- Is it 32-bit or 64-bit?
- Is it dynamically or statically linked?
- Is it stripped (symbols removed)?

### Step 2: Search for strings

```bash
strings exercises/bin/ex01_password_check
strings exercises/bin/ex01_password_check | grep -i pass
strings exercises/bin/ex01_password_check | grep -i flag
strings exercises/bin/ex01_password_check | grep -i grant
```

**Questions:**
- Can you find the password just from `strings`?
- What user-facing messages can you find?

### Step 3: Examine the ELF header

```bash
readelf -h exercises/bin/ex01_password_check
```

**Questions:**
- What is the entry point address?
- What is the machine type?

### Step 4: List symbols

```bash
nm exercises/bin/ex01_password_check
nm exercises/bin/ex01_password_check | grep " T "
```

**Questions:**
- What functions are defined in this binary (type T)?
- Can you find `check_password`?
- What library functions does it import (type U)?

### Step 5: Disassemble the check function

```bash
objdump -d exercises/bin/ex01_password_check | grep -A 20 "<check_password>"
```

**Questions:**
- Can you identify the `strcmp` call?
- Can you see where the secret string is loaded?

## Summary

Write down everything you discovered about this binary using only static tools.
In the next exercise, we'll see how dynamic tools reveal even more.
