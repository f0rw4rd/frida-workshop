# Static Analysis
## Examining Binaries Without Running Them

---

## What Is Static Analysis?

Analyzing a binary **without executing it**.

You look at the file on disk -its structure, code, data, and metadata.

**Advantages:**
- Safe -the binary never runs, so it cannot cause harm
- Complete -you can see all code paths, not just executed ones
- Reproducible -same binary, same results every time

**Disadvantages:**
- Cannot see runtime behavior (heap contents, network traffic, user input)
- Obfuscation and packing defeat many static techniques
- Can be overwhelming -large binaries have millions of instructions

---

## Tool Overview

| Tool       | Purpose                              | Depth    |
|------------|--------------------------------------|----------|
| `file`     | Identify file type and architecture  | Surface  |
| `strings`  | Extract readable text                | Surface  |
| `readelf`  | Examine ELF structure in detail      | Medium   |
| `nm`       | List symbols (functions, variables)  | Medium   |
| `objdump`  | Disassemble code sections            | Deep     |
| **Ghidra** | Full decompilation to pseudo-C       | Deep     |

We will use all of these except Ghidra in hands-on exercises.

---

## `file` - What Am I Looking At?

```bash
$ file /usr/bin/ls
/usr/bin/ls: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV),
dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
BuildID[sha1]=897f49..., for GNU/Linux 4.4.0, stripped

$ file /usr/lib/libc.so.6
/usr/lib/libc.so.6: ELF 64-bit LSB shared object, x86-64, version 1 (GNU),
dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
BuildID[sha1]=abc123..., for GNU/Linux 4.4.0, not stripped

$ file mystery_file
mystery_file: ELF 32-bit LSB executable, Intel 80386, version 1 (SYSV),
statically linked, stripped
```

**Key things to spot:**
- **32-bit vs 64-bit** -affects calling conventions and Frida usage
- **dynamically vs statically linked** -dynamic = more hookable with Frida
- **stripped vs not stripped** -stripped = no symbol names (harder to RE)
- **pie executable** -position-independent, addresses randomized at runtime

---

## `strings` - Finding Readable Text

```bash
# Basic usage -default minimum length is 4 characters
$ strings ./target_binary

# Minimum length of 8 characters (reduce noise)
$ strings -n 8 ./target_binary

# Show the offset of each string in the file
$ strings -t x ./target_binary

# Only search the data sections (not code)
$ strings -d ./target_binary
```

**What to look for:**

```bash
$ strings ./crackme | grep -i -E "pass|key|flag|secret|correct|wrong|access"
Enter the password:
Wrong password!
Access granted!
s3cret_k3y_2024
FLAG{you_found_it}
```

Sometimes the answer is right there in the strings.

---

## `strings` - Real-World Example

```bash
$ strings /usr/bin/curl | head -30
/lib64/ld-linux-x86-64.so.2
libcurl.so.4
curl_easy_init
curl_easy_setopt
curl_easy_perform
curl_easy_cleanup
curl_slist_append
...
Usage: curl [options...] <url>
 -d, --data <data>          HTTP POST data
 -H, --header <header/@file> Pass custom header(s)
 -o, --output <file>        Write to file instead of stdout
...
```

Strings reveal:
- **Library dependencies** (libcurl.so.4)
- **Function imports** (curl_easy_init, curl_easy_setopt)
- **Usage text and error messages**
- **Embedded paths, URLs, format strings**

---

## `readelf` - Examining ELF Structure

```bash
# ELF header -architecture, entry point, type
$ readelf -h ./binary

# Section headers -all sections in the binary
$ readelf -S ./binary
  [Nr] Name              Type             Address           Off    Size
  [ 1] .text             PROGBITS         0000000000401000  001000 000a3c
  [ 2] .rodata           PROGBITS         000000000040200c  00200c 000128
  [ 3] .data             PROGBITS         0000000000404000  003000 000048
  [ 4] .bss              NOBITS           0000000000404048  003048 000010
  ...

# Symbol table -functions and variables with addresses
$ readelf -s ./binary

# Dynamic section -shared library dependencies
$ readelf -d ./binary
  Tag        Type       Name/Value
  0x0000001  (NEEDED)   Shared library: [libc.so.6]
  0x0000001  (NEEDED)   Shared library: [libssl.so.3]
```

---

## `nm` - Symbol Table Examination

```bash
$ nm ./my_program
0000000000401000 T _start
0000000000401156 T main
0000000000401200 T check_password
0000000000401300 T encrypt_data
0000000000404000 D secret_key
0000000000404030 B buffer
                 U printf@@GLIBC_2.2.5
                 U strcmp@@GLIBC_2.2.5
                 U malloc@@GLIBC_2.2.5
                 U free@@GLIBC_2.2.5
```

**Symbol types that matter:**

| Symbol | Meaning                                |
|--------|----------------------------------------|
| `T`    | Code in .text section (defined here)   |
| `t`    | Local/static code (not exported)       |
| `D`    | Initialized data (global variable)     |
| `B`    | Uninitialized data (.bss)              |
| `U`    | Undefined -imported from a library   |
| `W`    | Weak symbol (can be overridden)        |

```bash
# On a stripped binary:
$ nm ./stripped_binary
nm: ./stripped_binary: no symbols

# Use dynamic symbols instead:
$ nm -D ./stripped_binary
                 U printf
                 U strcmp
```

---

## `objdump -d` - Disassembly

```bash
$ objdump -d ./crackme | less
```

You don't need to read every instruction. Look for patterns:

```
0000000000401156 <main>:
  40115e:   lea    0xe9f(%rip),%rdi        # <-- loads a string (the prompt)
  401165:   call   401030 <puts@plt>       #     prints it
  ...
  401181:   lea    0xe98(%rip),%rsi        # <-- loads another string (the secret password)
  401188:   mov    %rax,%rdi              #     first arg = user input
  40118b:   call   401040 <strcmp@plt>     # <-- KEY: compares two strings
  401190:   test   %eax,%eax              #     was strcmp result zero?
  401192:   jne    4011a2 <main+0x4c>     # <-- BRANCH: jump to "wrong" if not equal
```

- **`lea` ... `%rsi`** = loading the secret string address for comparison
- **`call strcmp`** = the comparison function (this is what Frida will hook)
- **`jne`** = "jump if not equal" (the decision point: correct vs wrong path)

---

## Reading Disassembly: Quick x86 Guide

```
Common instructions you'll see:

mov  dst, src     -copy value
lea  dst, [addr]  -load effective address (pointer math)
push val          -push onto stack
pop  reg          -pop from stack
call addr         -call function
ret               -return from function
cmp  a, b         -compare two values (sets flags)
test a, b         -bitwise AND, sets flags (test eax,eax = check if zero)
je / jne          -jump if equal / not equal
jmp  addr         -unconditional jump
xor  reg, reg     -zero a register (common idiom)
```

**Pattern to recognize -password/key check:**

```asm
call   strcmp@plt      ; compare two strings
test   %eax,%eax      ; is result zero?
jne    wrong_label     ; if not equal, jump to "wrong" path
; ... "correct" path falls through here
```

---

## Ghidra - Decompilation

Ghidra is the NSA's open-source reverse engineering framework.

It can **decompile** assembly back into C-like pseudocode:

```c
// Ghidra decompiler output (reconstructed from assembly)
int main(void) {
    char user_input[16];

    puts("Enter password:");
    scanf("%15s", user_input);

    if (strcmp(user_input, "s3cret_k3y") == 0) {
        puts("Access granted!");
        return 0;
    } else {
        puts("Wrong password!");
        return 1;
    }
}
```

**We won't deep-dive into Ghidra today** -it deserves its own workshop.
But know it exists and is free: https://ghidra-sre.org/

---

## Limitations of Static Analysis

### Obfuscation

```c
// Original code
if (strcmp(input, "password123") == 0) { grant_access(); }

// Obfuscated -string built at runtime
char pw[] = {0x70^0x41, 0x61^0x41, 0x73^0x41, ...};  // XOR encoded
for (int i = 0; i < len; i++) pw[i] ^= 0x41;         // decoded at runtime
if (strcmp(input, pw) == 0) { grant_access(); }
```

`strings` will NOT find "password123" in the obfuscated version.

### Other limitations:

- **Packed binaries** -UPX, custom packers compress/encrypt the real code
- **Runtime code generation** -JIT, self-modifying code
- **Anti-disassembly tricks** -junk bytes, opaque predicates
- **Environment-dependent behavior** -checks OS, time, network before acting

**This is where dynamic analysis shines.**

---

## Hands-On Exercise: Static Analysis

Let's compile and analyze a sample binary:

```bash
# Create a simple target
cat << 'CEOF' > /tmp/static_target.c
#include <stdio.h>
#include <string.h>

const char *secret = "LUG_2024_flag";

int check_access(const char *input) {
    return strcmp(input, secret) == 0;
}

int main() {
    char buf[64];
    printf("Enter access code: ");
    fgets(buf, sizeof(buf), stdin);
    buf[strcspn(buf, "\n")] = 0;

    if (check_access(buf)) {
        printf("Access granted! Flag: FLAG{%s}\n", secret);
    } else {
        printf("Access denied.\n");
    }
    return 0;
}
CEOF

# Compile it
gcc -o /tmp/static_target /tmp/static_target.c -no-pie
```

---

## Hands-On Exercise: Static Analysis (cont.)

```bash
# Now analyze it WITHOUT running it:
file /tmp/static_target
strings /tmp/static_target | grep -i -E "flag|access|secret"
nm /tmp/static_target | grep -E "T |U "
readelf -d /tmp/static_target
objdump -d /tmp/static_target | grep -A 20 "<check_access>"
```

Can you find the secret without running the binary?

See **`exercises/ex01-static-recon.md`** for the full walkthrough on `exercises/bin/ex01_password_check`.

---

## Exercise Solution

```bash
$ strings /tmp/static_target | grep -i flag
LUG_2024_flag
Access granted! Flag: FLAG{%s}

$ nm /tmp/static_target | grep -E " T | U "
0000000000401156 T check_access
0000000000401180 T main
                 U fgets@@GLIBC_2.2.5
                 U printf@@GLIBC_2.2.5
                 U strcmp@@GLIBC_2.2.5
                 U strcspn@@GLIBC_2.2.5

$ objdump -d -M intel /tmp/static_target | grep -A 10 "<check_access>"
0000000000401156 <check_access>:
  401156:   push   rbp
  401157:   mov    rbp, rsp
  40115a:   mov    QWORD PTR [rbp-0x8], rdi   # save input pointer
  40115e:   mov    rsi, QWORD PTR [rip+0x2eab] # load secret pointer
  401165:   mov    rdi, QWORD PTR [rbp-0x8]   # load input pointer
  401169:   call   401030 <strcmp@plt>          # compare them
  40116e:   test   eax, eax
  401170:   sete   al                          # return 1 if equal
```

The secret was plainly visible in `strings`. In real targets, it rarely is this easy.

---

## Summary

- **Static analysis** examines binaries without executing them
- **Reconnaissance tools:** `file`, `strings` -quick surface-level info
- **Structural tools:** `readelf`, `nm` -ELF internals and symbols
- **Code tools:** `objdump`, Ghidra -disassembly and decompilation
- Static analysis has clear **limitations** against obfuscation and packing
- When static analysis hits a wall, **dynamic analysis** picks up

**Next up: Dynamic Analysis -watching programs run**
