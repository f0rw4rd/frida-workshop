# Module 4: strace & ltrace - Observing Program Behavior

---

## What is strace?

**strace** traces **system calls** - the interface between your program and the Linux kernel.

Every time a program:
- Opens a file -> `open()` / `openat()`
- Reads data -> `read()`
- Writes output -> `write()`
- Allocates memory -> `mmap()` / `brk()`
- Creates a process -> `fork()` / `clone()`

...the kernel is involved, and **strace can see it**.

```
┌─────────────┐         syscalls         ┌────────────┐
│  User Space  │ ──────────────────────> │   Kernel    │
│  (your app)  │ <────────────────────── │  (Linux)    │
└─────────────┘    strace intercepts     └────────────┘
                      these calls
```

---

## strace Basics

### Trace a program from the start

```bash
strace ./program
```

### Trace a specific command

```bash
strace ls /tmp
```

### Filter specific syscalls

```bash
strace -e trace=open,read,write ./program
```

### Output is written to **stderr** by default

```bash
# Separate strace output from program output
strace -o trace.log ./program
```

---

## Essential strace Flags

| Flag | Purpose | Example |
|------|---------|---------|
| `-e trace=SET` | Filter syscalls | `-e trace=open,read,write` |
| `-f` | Follow child processes | `strace -f ./server` |
| `-p PID` | Attach to running process | `strace -p 1234` |
| `-o FILE` | Write output to file | `-o trace.log` |
| `-c` | Summary / statistics | Shows call counts & times |
| `-s SIZE` | Max string print length | `-s 200` (default: 32) |

> See the cheat sheet at the end for more flags.

---

## strace: Real Examples

**Example 1: `cat /etc/passwd`**

```bash
$ strace -e trace=openat,read,write,close cat /etc/passwd 2>&1 | head -25
```

```
openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libc.so.6", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/etc/passwd", O_RDONLY) = 3
read(3, "root:x:0:0:root:/root:/bin/bash\n"..., 131072) = 2790
write(1, "root:x:0:0:root:/root:/bin/bash\n"..., 2790) = 2790
```

- Linker loads libc first, then opens `/etc/passwd` as fd 3
- Reads 2790 bytes, writes them to fd 1 (stdout)

**Example 2: `ls /tmp`**

```bash
$ strace -e trace=openat ls /tmp 2>&1 | head -10
```

```
openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libc.so.6", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libpcre2-8.so.0", O_RDONLY|O_CLOEXEC) = 3
openat(AT_FDCWD, "/tmp", O_RDONLY|O_NONBLOCK|O_CLOEXEC|O_DIRECTORY) = 3
```

- Even a simple `ls` opens many files: shared libraries, locale data, then the target directory

---

## strace Summary Mode (-c)

```bash
$ strace -c ls /tmp 2>&1
```

```
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 28.43    0.000054           6         9           mmap
 14.74    0.000028           4         7           openat
 11.58    0.000022           3         7           close
 10.00    0.000019           3         7           fstat
  8.42    0.000016           2         7           mprotect
  5.79    0.000011          11         1           write
  5.26    0.000010           3         3           read
  4.21    0.000008           4         2           getdents64
  3.68    0.000007           3         2           pread64
  ...
------ ----------- ----------- --------- --------- ----------------
100.00    0.000190           3        56         1 total
```

Great for profiling - see which syscalls dominate.

---

## strace: Attach to a Running Process

```bash
# Find the PID
$ pidof firefox
28491

# Attach to it (requires ptrace permissions)
$ sudo strace -p 28491
```

```bash
# Follow all threads of a multi-threaded process
$ sudo strace -fp 28491
```

```bash
# Watch what files a running process opens
$ sudo strace -p 28491 -e trace=openat
```

This is extremely useful for debugging running services and daemons.

---

## What is ltrace?

**ltrace** traces **library function calls** - calls your program makes to shared libraries (libc, libssl, etc.).

```
┌─────────────┐     library calls     ┌─────────────┐     syscalls     ┌────────┐
│  Your App    │ ───────────────────> │  libc.so     │ ──────────────> │ Kernel │
│              │ <─────────────────── │  libssl.so   │ <────────────── │        │
└─────────────┘   ltrace intercepts   └─────────────┘                  └────────┘
                    these calls           strace intercepts these ──────┘
```

**Key difference:**
- **strace** = kernel-level view (syscalls)
- **ltrace** = library-level view (function calls like `strcmp`, `malloc`, `printf`)

---

## ltrace Basics

### Trace a program from the start

```bash
ltrace ./program
```

### Show longer strings (default truncates at 32 chars)

```bash
ltrace -s 200 ./program
```

### Filter specific functions

```bash
ltrace -e strcmp+strlen+puts ./program
```

### Trace calls to a specific library

```bash
ltrace -l libcrypto.so ./program
```

---

## Essential ltrace Flags

| Flag | Purpose | Example |
|------|---------|---------|
| `-e FILTER` | Filter functions | `-e malloc+free` |
| `-s SIZE` | Max string display length | `-s 200` |
| `-C` | Demangle C++ names | Makes C++ output readable |
| `-n INDENT` | Indent nested calls | `-n 4` |
| `-p PID` | Attach to running process | `-p 1234` |

> See the cheat sheet at the end for more flags.

---

## Real Example: ltrace on a Simple Program

```bash
$ cat hello.c
#include <stdio.h>
#include <string.h>

int main() {
    char buf[64];
    printf("Enter password: ");
    fgets(buf, 64, stdin);
    buf[strlen(buf)-1] = '\0';  // strip newline
    if (strcmp(buf, "opensesame") == 0) {
        puts("Access granted!");
    } else {
        puts("Access denied!");
    }
    return 0;
}
```

```bash
$ gcc -o hello hello.c
```

---

## THE KEY DEMO: ltrace Reveals Passwords

```bash
$ ltrace -s 200 ./hello
```

```
printf("Enter password: ")                     = 16
Enter password: wrongguess
fgets("wrongguess\n", 64, 0x7f8a1b2d4a00)     = 0x7ffc3e8a1b20
strlen("wrongguess\n")                         = 11
strcmp("wrongguess", "opensesame")              = 8
puts("Access denied!")                         = 15
Access denied!
+++ exited (status 0) +++
```

### The password is RIGHT THERE: `strcmp("wrongguess", "opensesame")`

ltrace shows **both arguments** to `strcmp` - the user input AND the secret!

---

## Let's Verify It Works

```bash
$ ltrace -s 200 ./hello
```

```
printf("Enter password: ")                     = 16
Enter password: opensesame
fgets("opensesame\n", 64, 0x7f8a1b2d4a00)     = 0x7ffc3e8a1b20
strlen("opensesame\n")                         = 11
strcmp("opensesame", "opensesame")              = 0
puts("Access granted!")                        = 16
Access granted!
+++ exited (status 0) +++
```

`strcmp` returns **0** (strings are equal) -> access granted!

This is why **hardcoded plaintext passwords are never safe** - even in compiled binaries.

---

## Quick Exercises

Try these on your own (5 minutes each):

**1. Find what files a program opens**
```bash
$ strace -e trace=openat -o /tmp/trace.log python3 -c "import os; print(os.getenv('HOME'))"
$ grep -v "ld.so\|libc\|libpthread\|libdl" /tmp/trace.log
```
Why does `os.getenv('HOME')` open `/etc/passwd`?

**2. Find a hardcoded password with ltrace**
```bash
$ ltrace -s 200 ./secret_checker
```
Look for `strcmp` - the password is right there in the arguments.

**3. Network tracing with strace**
```bash
$ strace -e trace=network curl -s https://example.com -o /dev/null
```
Identify the IP address, port, and protocol from the `connect()` call.

---

## strace vs ltrace: Side-by-Side Comparison

```bash
# The same simple program, two different views:
```

**ltrace** (library calls):
```
printf("Hello %s\n", "world")     = 12
malloc(1024)                       = 0x55a1b2c3d4e0
strcmp("foo", "bar")               = 4
free(0x55a1b2c3d4e0)              = <void>
```

**strace** (system calls):
```
write(1, "Hello world\n", 12)     = 12
brk(0x55a1b2c5f000)              = 0x55a1b2c5f000
write(1, "Match!\n", 7)           = 7
```

| | strace | ltrace |
|---|--------|--------|
| **Level** | Kernel syscalls | Library functions |
| **Sees** | open, read, write, mmap | strcmp, malloc, printf |
| **Shows** | OS-level behavior | Application-level logic |
| **Best for** | File/network/process debugging | Finding passwords, logic flow |

---

## Advanced strace: Conditional Tracing

```bash
# Only show syscalls that FAIL
$ strace -e trace=openat -Z ./program
openat(AT_FDCWD, "/etc/app.conf", O_RDONLY) = -1 ENOENT (No such file or directory)

# Show syscalls that return a specific error
$ strace -e trace=openat -e status=failed ./program

# Trace only syscalls related to signals
$ strace -e trace=signal ./program

# Trace memory-related syscalls
$ strace -e trace=memory ./program

# Decode file descriptor paths in output
$ strace -y -e trace=read,write ./program
read(3</etc/passwd>, "root:x:0:0:..."..., 4096) = 2790
write(1</dev/pts/0>, "root:x:0:0:..."..., 2790) = 2790
```

---

## Advanced ltrace: Tracing Local Functions

```bash
# Trace internal (non-library) function calls too
$ ltrace -x '*' ./program
```

```
main(1, 0x7ffd12345678, 0x7ffd12345688, 0) = <unfinished ...>
validate_input(0x7ffd12345420, 64, 0, 0)   = <unfinished ...>
strlen("user_input")                         = 10
strcmp("user_input", "secret123")            = 1
<... validate_input resumed>                 = 0
puts("Access denied!")                       = 15
<... main resumed>                           = 1
```

Now we can see **internal function names** like `validate_input` - giving us more insight into program logic.

---

## Limitations of strace and ltrace

### 1. ptrace-based (Detectable)
```c
// Anti-debugging: program can detect it's being traced
if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) {
    printf("Debugger detected! Exiting.\n");
    exit(1);
}
```

### 2. Performance Overhead
- strace: 10-100x slowdown on syscall-heavy programs
- ltrace: significant overhead on function-call-heavy programs

### 3. Observation Only
- You can **see** what happens, but you **cannot change** it
- Cannot modify arguments, return values, or program flow

### 4. Stripped/Obfuscated Binaries
- ltrace struggles with statically linked binaries (no dynamic library calls)
- Custom `strcmp` implementations won't show up in ltrace

---

## The Bridge to Frida

We just saw ltrace reveal: `strcmp("wrongguess", "opensesame") = 8`

But what if the password is computed at runtime, hashed, or fetched from a server?

| | strace/ltrace | Frida |
|---|--------------|-------|
| **Observe** calls | Yes | Yes |
| **Modify** arguments | No | Yes |
| **Change** return values | No | Yes |
| **Replace** functions | No | Yes |
| **Modify binary on disk** | N/A | Not needed |

```
ltrace:  observe  ──>  "I can see the strcmp call"
Frida:   control  ──>  "I can make strcmp return whatever I want"
```

**Preview:** Frida script to force `strcmp` to always return 0 (match):

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        console.log("strcmp(" + args[0].readUtf8String() +
            ", " + args[1].readUtf8String() + ")");
    },
    onLeave(retval) { retval.replace(0); }  // Force match!
});
```

We will build exactly this in the next modules.

---

## Cheat Sheet: strace & ltrace

**strace essentials:**
```bash
strace ./program                          # Trace from start
strace -p PID                             # Attach to running process
strace -f ./program                       # Follow forks/threads
strace -e trace=file ./program            # File operations only
strace -e trace=network ./program         # Network operations only
strace -s 200 ./program                   # Show 200 chars of strings
strace -c ./program                       # Summary statistics
strace -o output.log ./program            # Save to file
strace -Z ./program                       # Only show failed calls
```

**ltrace essentials:**
```bash
ltrace ./program                          # Trace from start
ltrace -s 200 ./program                   # Show 200 chars of strings
ltrace -e strcmp+strlen+puts ./program    # Specific functions
ltrace -l libcrypto.so ./program          # Specific library
ltrace -x '*' ./program                   # Include local functions
ltrace -c ./program                       # Summary statistics
```

---

## Hands-On Lab (15 min)

**Target:** `exercises/bin/ex01_password_check`
**Goal:** Use strace and ltrace to discover a hardcoded password.

**What you will practice:**
- Filtering syscalls with `strace -e trace=openat`
- Finding password comparisons with `ltrace -s 200 | grep cmp`
- Interpreting function arguments and return values

See **`exercises/ex02-strace-ltrace.md`** for step-by-step instructions.

---

## Summary

| Tool | What it traces | Best for |
|------|---------------|----------|
| **strace** | System calls (kernel interface) | File access, network, process debugging |
| **ltrace** | Library function calls | Finding passwords, understanding logic |
| **Frida** (next!) | Everything + modification | Full control over running programs |

### Key Takeaways

1. **strace** shows you the OS-level view: files, network, processes
2. **ltrace** shows you the application-level view: function calls, arguments, return values
3. Both are **observation only** - you can see but not change
4. Both are **ptrace-based** - detectable by anti-debugging
5. **Frida** overcomes these limitations - it can observe AND modify

### Next: Installing Frida and running our first instrumentation script
