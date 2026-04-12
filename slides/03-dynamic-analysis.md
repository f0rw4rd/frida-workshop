# Dynamic Analysis
## Observing Programs in Action

---

## What Is Dynamic Analysis?

Analyzing a binary **while it executes**.

Instead of reading dead code on disk, you watch the living program:

- What system calls does it make?
- What library functions does it call, and with what arguments?
- What data flows through memory?
- How does it respond to different inputs?


---

## Static vs Dynamic: Comparison

| Aspect                | Static Analysis          | Dynamic Analysis          |
|-----------------------|--------------------------|---------------------------|
| Execution required?   | No                       | Yes                       |
| Safety                | Safe (nothing runs..)    | Risk (code executes)      |
| Code coverage         | All paths visible        | Only executed paths        |
| Obfuscation           | Major obstacle           | Code decrypted at runtime  |
| Packed binaries       | See packer, not payload  | See unpacked payload       |
| Actual data values    | Inferred from structure  | Observed directly          |
| Runtime behavior      | Theoretical              | Real                       |
| Modify behavior?      | No                       | Yes                        |
| Stripped binaries     | Limited info             | Still fully observable     |
| Speed of analysis     | Can be slow for big bins | Fast for targeted questions |

---

## Why Dynamic Analysis Is Often Superior

### 1. Sees actual runtime behavior

```c
// Which branch executes? Static analysis sees both.
// Dynamic analysis sees the one that actually runs.
if (time(NULL) % 2 == 0) {
    do_normal_thing();
} else {
    do_sneaky_thing();
}
```

### 2. Defeats obfuscation and packing

```bash
# Static: strings finds nothing useful in a UPX-packed binary
$ strings packed_malware | wc -l
12

# Dynamic: strace sees everything the unpacked code does
$ strace ./packed_malware 2>&1 | grep connect
connect(3, {sa_family=AF_INET, sin_port=htons(4444),
        sin_addr=inet_addr("10.0.0.1")}, 16) = 0
```

The packer decrypts the real code in memory. Dynamic analysis sees the result.

---

## Why Dynamic Analysis Is Often Superior (cont.)

### 3. Reveals actual data values

```bash
# What password does the program actually compare against?
$ ltrace ./crackme <<< "test"
strcmp("test", "runtime_generated_pw!")  = -1
puts("Wrong!")                          = 7
```

The password was built at runtime -`strings` could never find it.

### 4. Can modify behavior on the fly

```javascript
// Frida: make check_password() always return true
Interceptor.replace(
    Module.getGlobalExportByName("check_password"),
    new NativeCallback(function() {
        return 1;  // always "correct"
    }, 'int', ['pointer'])
);
```

### 5. Works on stripped binaries

No symbols? No problem. You can still trace every syscall, every library call, and hook any address.

---

## The Dynamic Analysis Tool Spectrum

```
Least invasive                                    Most powerful
      |                                                 |
      v                                                 v

  strace        ltrace        gdb        LD_PRELOAD     Frida
    |              |            |             |            |
  syscalls     lib calls    stepping     hook libs    hook anything
  read-only    read-only    read/write   write        read/write
  no setup     no setup     some setup   coding       scripting
  low impact   low impact   stops exec   moderate     powerful
```

Each tool has its sweet spot. Use the simplest tool that answers your question.

---

## The Instrumentation Pyramid

```
                 +-------------------------+
                 |  DBI Frameworks         |  Pin, DynamoRIO, Valgrind
                 |  (full control)         |  Rewrite every instruction
                 +-------------------------+
                  +-------------------------+
                  |    Frida                 |  Programmable hooking
                  |    (scriptable hooks)    |  JavaScript/Python API
                  +-------------------------+
               +-------------------------------+
               |    LD_PRELOAD                  |  Replace library functions
               |    (function replacement)      |  At load time
               +-------------------------------+
            +-------------------------------------+
            |    gdb                               |  Breakpoints, stepping
            |    (interactive debugging)           |  Inspect/modify state
            +-------------------------------------+
         +-----------------------------------------+
         |    ltrace                                |  Trace library calls
         |    (library call tracing)                |  Arguments and returns
         +-----------------------------------------+
      +---------------------------------------------+
      |    strace                                    |  Trace system calls
      |    (system call tracing)                     |  Kernel boundary
      +---------------------------------------------+
```

---

## strace - System Call Tracing

Traces every system call a program makes to the kernel.

```bash
# Basic usage
$ strace ./program
execve("./program", ["./program"], ...) = 0
brk(NULL)                               = 0x55b3a4c5d000
openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY) = 3
read(3, "\177ELF\2\1\1\3\0\0\0\0\0\0\0\0"..., 832) = 832
...
write(1, "Hello, World!\n", 14)         = 14
exit_group(0)                           = ?

# Follow child processes
$ strace -f ./daemon

# Filter by syscall category
$ strace -e trace=network ./client
$ strace -e trace=file ./program
$ strace -e trace=write ./program

# Show timestamps
$ strace -t ./program

# Count syscalls (summary)
$ strace -c ./program
```

---

## strace - Practical Examples

### Finding out what files a program opens:

```bash
$ strace -e trace=openat ./mystery_app 2>&1 | head
openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libc.so.6", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/home/user/.config/mystery/config.ini", O_RDONLY) = 4
openat(AT_FDCWD, "/tmp/.mystery_cache", O_RDWR|O_CREAT, 0600) = 5
```

### Finding out what a program sends over the network:

```bash
$ strace -e trace=network -s 256 ./client 2>&1
socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3
connect(3, {sa_family=AF_INET, sin_port=htons(8080),
        sin_addr=inet_addr("192.168.1.100")}, 16) = 0
sendto(3, "GET /api/key?token=abc123 HTTP/1.1\r\n...", 89, 0, NULL, 0) = 89
```

### Why does a program crash?

```bash
$ strace ./crashing_app 2>&1 | tail -5
openat(AT_FDCWD, "/etc/app/required.conf", O_RDONLY) = -1 ENOENT (No such file)
write(2, "Error: config file not found\n", 29) = 29
exit_group(1)
```

---

## ltrace - Library Call Tracing

Traces calls to shared library functions (libc, libssl, etc.).

```bash
# Basic usage
$ ltrace ./crackme <<< "wrongpass"
puts("Enter the password:")                       = 21
fgets("wrongpass\n", 64, 0x7f8a3c1ba980)          = 0x7ffc8a2d3e10
strcspn("wrongpass\n", "\n")                       = 9
strcmp("wrongpass", "sup3r_s3cret!")                = -1
puts("Access denied.")                             = 15
+++ exited (status 1) +++

# Filter to specific libraries
$ ltrace -e strcmp+strlen ./program

# Show nested calls
$ ltrace -n 2 ./program

# Demangle C++ symbols
$ ltrace -C ./cpp_program
```

**Look at that `strcmp` call** -the password is `sup3r_s3cret!`, revealed in plain text even if the binary was obfuscated.

---

## ltrace vs strace

```
                    User Space
    +-----------------------------------------+
    |  Your Program                            |
    |    |                                     |
    |    +---> printf("Hello %s", name)        |  <-- ltrace sees this
    |    |         |                           |
    |    |         +---> formatting logic       |
    |    |         |                           |
    |    |         +---> write(1, "Hello Bob") |
    |    |                    |                |
    +----|--------------------|-----------------+
         |                    |
    =====|====================|=================  Kernel Boundary
         |                    |
    +----|--------------------|-----------------+
    |    |               write(1, buf, 9)      |  <-- strace sees this
    |    |               (system call)          |
    |  Kernel                                   |
    +-----------------------------------------+
```

- **strace** = kernel boundary (syscalls) -lower level, always available
- **ltrace** = library boundary -higher level, more readable, needs dynamic linking

---

## gdb - Interactive Debugging

```bash
# Start debugging
$ gdb ./program
(gdb) break main
(gdb) run

# At a breakpoint, inspect state
(gdb) info registers
(gdb) x/s $rdi                    # examine string at rdi
(gdb) x/20i $rip                  # disassemble 20 instructions at current point
(gdb) print (char*)0x404010       # print string at address

# Modify execution
(gdb) set $rax = 1                # change return value
(gdb) set *(int*)0x404030 = 42    # write to memory
(gdb) jump *0x40119a              # jump to address

# Continue
(gdb) continue
(gdb) step                        # step into
(gdb) next                        # step over
```

**gdb is powerful but manual.** Frida lets you automate what you'd do in gdb.

---

## LD_PRELOAD - Function Replacement

Override library functions by loading your code first:

```c
// bypass_check.c
#include <string.h>

// Our strcmp always returns 0 (strings "match")
int strcmp(const char *s1, const char *s2) {
    return 0;
}
```

```bash
# Compile as shared library
$ gcc -shared -o bypass.so bypass_check.c

# Load it before libc
$ LD_PRELOAD=./bypass.so ./crackme
Enter password: anything_works
Access granted!
```

---

## LD_PRELOAD - Function Replacement (cont.)

**Limitations of LD_PRELOAD:**
- Only works at load time (cannot attach to running process)
- Only replaces dynamically linked functions
- Requires writing and compiling C code
- Cannot selectively hook (replaces ALL calls to that function)

**Frida solves all of these limitations.** It automates what `LD_PRELOAD` does manually - and adds scripting, selective hooking, and runtime attachment.

| | LD_PRELOAD | Frida |
|---|---|---|
| **Hook timing** | Load time only | Any time (attach/spawn) |
| **Language** | C (compile, deploy) | JavaScript (instant, live) |
| **Selectivity** | Replaces all calls | Hook specific calls with conditions |
| **Attach to running** | No | Yes |
| **Read args/returns** | Manual code | Built-in API |

---

## When To Use What

| Situation                                      | Best Tool              |
|------------------------------------------------|------------------------|
| "What files does this program open?"           | `strace -e file`       |
| "What network connections does it make?"       | `strace -e network`    |
| "What password does it compare against?"       | `ltrace`               |
| "What library functions does it call?"         | `ltrace`               |
| "I need to step through code instruction by instruction" | `gdb`       |
| "I want to change a variable at a breakpoint"  | `gdb`                 |
| "I want to replace a function for all calls"   | `LD_PRELOAD`          |
| "I want to hook specific calls with custom logic" | **Frida**          |
| "I want to attach to a running process"        | **Frida** or `gdb`    |
| "I want to automate RE tasks with scripting"   | **Frida**             |
| "I need to intercept encrypted data before encryption" | **Frida**     |

---

## Combining Tools: A Real Workflow

```
Step 1: Reconnaissance
$ file ./target && strings ./target | less

Step 2: Quick dynamic overview
$ strace -c ./target                  # what syscalls? how many?
$ ltrace -c ./target                  # what library calls?

Step 3: Targeted tracing
$ strace -e openat,read,write ./target  # file I/O
$ ltrace -e strcmp+strncmp ./target      # string comparisons

Step 4: Interactive investigation
$ gdb ./target                         # set breakpoints, inspect

Step 5: Automated hooking
$ frida -l hook.js ./target            # Frida for the win
```

Each step narrows the focus. Start broad, zoom in.

---

## Security Note

**Always analyze untrusted binaries in an isolated environment.**

```bash
# Option 1: Virtual machine (VirtualBox, QEMU, virt-manager)
# Full isolation, snapshot and restore

# Option 2: Container with limited privileges
$ docker run --rm -it --cap-drop=ALL \
    -v ./samples:/samples:ro \
    ubuntu:22.04 bash

# Option 3: Firejail sandbox
$ firejail --net=none --private ./suspicious_binary

# Option 4: systemd-run with restrictions
$ systemd-run --user --scope \
    -p NoNewPrivileges=yes \
    -p PrivateNetwork=yes \
    ./suspicious_binary
```

Dynamic analysis **executes code**. If the binary is malicious, it will do malicious things.

The targets in this workshop are safe -we compile them ourselves.

---

## Hands-On Exercise: Dynamic Analysis

```bash
# Create a target with runtime string construction
cat << 'CEOF' > /tmp/dynamic_target.c
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static char* build_password(void) {
    char *pw = malloc(16);
    pw[0] = 'r'; pw[1] = 'u'; pw[2] = 'n';
    pw[3] = 't'; pw[4] = 'i'; pw[5] = 'm';
    pw[6] = 'e'; pw[7] = '_'; pw[8] = 'p';
    pw[9] = 'w'; pw[10] = '!'; pw[11] = '\0';
    return pw;
}

int main() {
    char buf[64];
    char *password = build_password();

    printf("Enter password: ");
    fgets(buf, sizeof(buf), stdin);
    buf[strcspn(buf, "\n")] = 0;

    if (strcmp(buf, password) == 0) {
        printf("Welcome in!\n");
    } else {
        printf("Nope.\n");
    }
    free(password);
    return 0;
}
CEOF

gcc -o /tmp/dynamic_target /tmp/dynamic_target.c
```

---

## Exercise: Try It Yourself

```bash
# 1. Does strings find the password?
$ strings /tmp/dynamic_target | grep -i pass
# (you'll find "password" from variable names, but not the actual value)

# 2. Use ltrace to find it
$ ltrace /tmp/dynamic_target <<< "test"
# Look for the strcmp call!

# 3. Use strace to see file/IO behavior
$ strace -e trace=write /tmp/dynamic_target <<< "test"
# See the write() calls for prompts and output

# 4. Now use the password you found
$ /tmp/dynamic_target
Enter password: <what ltrace revealed>
Welcome in!
```

**Key takeaway:** Static analysis failed. Dynamic analysis succeeded in seconds.

---

## Summary

- **Dynamic analysis** observes programs during execution
- It defeats obfuscation, packing, and runtime code generation
- **strace** -system call tracing (kernel boundary)
- **ltrace** -library call tracing (user-space boundary)
- **gdb** -interactive debugging (full control, manual)
- **LD_PRELOAD** -function replacement (compile-time, limited)
- Use the **simplest tool** that answers your question
- Always sandbox untrusted binaries

**After the break: Frida -programmable instrumentation that combines the best of all these tools.**

---

## Break Time

Take 10 minutes. Stretch. Grab a drink.

When we come back: **Frida** -the tool that changes everything.


```
        ) )
       ( (
     .------.
     |      |]
     \      /
      `----'

  10 min break
```
