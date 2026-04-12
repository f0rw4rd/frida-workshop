# Exercise 2: Dynamic Observation with strace and ltrace

**Duration:** ~15 minutes
**Tools:** strace, ltrace
**Targets:** `exercises/bin/ex01_password_check`, `exercises/bin/ex02_file_reader`, `exercises/bin/ex02_network_beacon`

## Part A: strace on ex02_file_reader

### Step 1: Run strace to see file access

```bash
strace ./exercises/bin/ex02_file_reader 2>&1 | grep -E "open|ENOENT"
```

**Questions:**
- What files does the program try to open?
- In what order does it try them?
- Which calls fail with ENOENT (file not found)?

### Step 2: Filter for specific syscalls

```bash
strace -e trace=openat,read,write ./exercises/bin/ex02_file_reader
```

### Step 3: Create a config file and trace again

```bash
echo "PREMIUM" > /tmp/config.dat
strace -e trace=openat,read ./exercises/bin/ex02_file_reader
```

**Question:** Can you see the program reading "PREMIUM" from the file?

## Part B: strace on ex02_network_beacon

### Step 1: Trace network syscalls

```bash
strace -e trace=network ./exercises/bin/ex02_network_beacon
```

**Questions:**
- What IP address and port does it try to connect to?
- What data does it try to send?

### Step 2: Trace with environment variable

```bash
BEACON_HOST=10.0.0.1 strace -e trace=network ./exercises/bin/ex02_network_beacon
```

## Part C: ltrace on ex01_password_check (THE KEY EXERCISE)

### Step 1: Run ltrace

```bash
ltrace ./exercises/bin/ex01_password_check
```

Type any password when prompted (e.g., "hello").

**THE BIG REVEAL:** Look at the `strcmp()` call in the ltrace output!

```
strcmp("hello", "sup3r_s3cr3t_p4ss") = ...
```

The password is right there in the ltrace output!

### Step 2: Verify

```bash
./exercises/bin/ex01_password_check
```

Enter the password you found in the ltrace output.

### Step 3: Try ltrace with more detail

```bash
ltrace -s 200 ./exercises/bin/ex01_password_check
```

## Part D: ltrace on ex02_file_reader

```bash
ltrace ./exercises/bin/ex02_file_reader
```

**Questions:**
- Can you see the `fopen()` calls with file paths?
- Can you see the `strncmp()` call checking for "PREMIUM"?

## Key Takeaways

1. **strace** shows you what the program asks the **kernel** to do (syscalls)
2. **ltrace** shows you what **library functions** the program calls
3. ltrace often reveals secrets that `strings` alone cannot (especially with obfuscation)
4. Both tools are **passive** - they observe but cannot modify behavior
5. Next up: **Frida** lets us not just observe, but **change** what functions return!
