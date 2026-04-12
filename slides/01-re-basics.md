# Reverse Engineering Basics

---

## What Is Reverse Engineering?

**Understanding software without access to source code.**

You have a compiled binary. You want to know:

- What does it do?
- How does it do it?
- Can it be made to do something else?

```
Source Code  --[compiler]-->  Binary  --[reverse engineer]-->  Understanding
     ^                                                              |
     |______________________________________________________________|
                        (reconstruct knowledge)
```

---

## Why Reverse Engineer?

- **Security auditing** -find vulnerabilities in closed-source software
- **Malware analysis** -understand what a suspicious binary actually does
- **Interoperability** -make software work together (drivers, protocols, file formats)
- **CTF competitions** -capture the flag challenges in security contests
- **Legacy code** -understand undocumented systems nobody remembers writing
- **Learning** -deeply understand how compilers, OSes, and software work

---

## Legal Considerations

Reverse engineering is legal in the EU under specific conditions:

- **EU Directive 2009/24/EC** - RE allowed for interoperability with other software
- **2021 CJEU ruling** - expanded to allow decompilation for bug fixing
- **Austrian UrhG (Copyright Act)** - §§ 40c-40e implement the EU directive; decompilation for interoperability is permitted
- **EULAs** - some prohibit RE, but EU law overrides contractual restrictions for interoperability
- **US (DMCA)** - similar exemptions exist for security research (for international context)

**For this workshop:**

- We only analyze our own binaries and open-source software
- Interoperability and security research are protected under EU law
- For professional engagements, get legal advice specific to your jurisdiction

---

## The RE Workflow

```
 +------------------+     +------------------+     +------------------+
 |  Reconnaissance  | --> | Static Analysis  | --> | Dynamic Analysis |
 |                  |     |                  |     |                  |
 | file, strings,   |     | objdump, readelf |     | strace, ltrace,  |
 | checksums, size  |     | Ghidra, nm       |     | gdb, Frida       |
 +------------------+     +------------------+     +------------------+
                                                           |
                                                           v
                                                   +------------------+
                                                   | Documentation    |
                                                   |                  |
                                                   | notes, diagrams, |
                                                   | scripts, reports |
                                                   +------------------+
```

Each phase feeds back into the others. RE is iterative, not linear.

---

## Binary Formats: ELF on Linux

**ELF** = Executable and Linkable Format -the standard binary format on Linux.

```
+-------------------+
| ELF Header        |  <-- Magic bytes, arch, entry point
+-------------------+
| Program Headers   |  <-- How to load into memory (segments)
+-------------------+
| .text             |  <-- Executable code
| .rodata           |  <-- Read-only data (strings, constants)
| .data             |  <-- Initialized global variables
| .bss              |  <-- Uninitialized global variables
| .plt              |  <-- Function call stubs (how your program calls library functions)
| .got              |  <-- Address table filled at runtime (where libc function addresses live)
| .symtab           |  <-- Symbol table
| .strtab           |  <-- String table
| ...               |
+-------------------+
| Section Headers   |  <-- Metadata about sections
+-------------------+
```

PLT/GOT are how your binary calls functions like `printf` or `strcmp` from libc. Frida hooks functions at this level.

---

## ELF: Sections vs Segments

**Sections** -the linker's view (used at build time):

- `.text` -code, `.data` -data, `.rodata` -constants

**Segments** -the loader's view (used at run time):

- `LOAD` segments map sections into memory with permissions (R/W/X)

```bash
# View sections
readelf -S ./binary

# View segments (program headers)
readelf -l ./binary
```

A stripped binary can have segments removed of section headers, but segments must remain for the program to load.

---

## Quick Demo: Reconnaissance Tools

```bash
# What kind of file is this?
$ file /usr/bin/ls
/usr/bin/ls: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV),
dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
BuildID[sha1]=..., for GNU/Linux 4.4.0, stripped

# ELF header details
$ readelf -h /usr/bin/ls
ELF Header:
  Magic:   7f 45 4c 46 02 01 01 00 ...
  Class:                             ELF64
  Type:                              DYN (Position-Independent Executable)
  Entry point address:               0x6b10
  ...

# Interesting strings
$ strings /usr/bin/ls | head -20
/lib64/ld-linux-x86-64.so.2
libc.so.6
fflush
__printf_chk
...
```

---

## Key Concepts: Symbols and Linking

**Symbols** -named addresses in a binary (functions, variables):

```bash
$ nm ./my_program
0000000000401156 T main          # T = text section (code), defined here
0000000000404030 D global_var    # D = data section, defined here
                 U printf        # U = undefined, imported from libc
                 U malloc        # U = undefined, imported from libc
```

**Dynamic linking** -resolving symbols at load time or first call:

```
Your binary           libc.so
+-----------+         +-----------+
| main()    |         | printf()  |  <-- actual implementation
| calls     |-------->| malloc()  |
| printf()  |  GOT/   | free()    |
+-----------+  PLT    +-----------+
```

---

## GOT and PLT: How Dynamic Calls Work

```
Code calls printf()
        |
        v
+-------+-------+
|  PLT stub      |  .plt -small trampoline code
|  jmp *GOT[n]   |-------> GOT entry (initially points back to PLT)
+----------------+                |
                           (first call: dynamic linker resolves)
                           (subsequent calls: direct jump to printf)
                                  |
                                  v
                          +-------+-------+
                          |  libc printf  |  actual function
                          +---------------+
```

**Why this matters for Frida:** We can intercept calls by hooking PLT entries
or by replacing GOT pointers - Frida does this transparently for us.

---

## Calling Conventions: Why They (Barely) Matter

C functions pass arguments via registers or the stack. The rules vary by architecture:

| Architecture | First args | How |
|---|---|---|
| x86 (32-bit) | Stack | Pushed right to left |
| x86_64 (64-bit) | `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9` | Registers first, then stack |

**The good news: Frida handles this for you.**

```javascript
Interceptor.attach(Module.getGlobalExportByName("open"), {
    onEnter(args) {
        // args[0] is always the first argument, regardless of architecture
        console.log("open:", args[0].readUtf8String());
    }
});
```

You only need to know calling conventions when reading raw assembly in objdump/Ghidra.

---

## Summary

- RE = understanding binaries without source code
- The workflow: **recon -> static -> dynamic -> document**
- ELF is the binary format on Linux -know its structure
- Symbols, GOT, and PLT are how dynamic linking works
- Calling conventions tell you where function arguments live
- All of this builds the foundation for using Frida effectively

**Next up: Static Analysis Tools**
