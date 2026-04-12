# Exercise 4: Bypassing Checks with Frida

**Duration:** ~15 minutes
**Tools:** frida
**Targets:** `exercises/bin/ex01_password_check`, `exercises/bin/ex04_license_check`

## Part A: Bypass the password check

In Exercise 3 we *observed* the password. Now we'll **bypass** the check entirely
without knowing the password.

### Step 1: Create ex04_bypass_password.js

```javascript
// ex04_bypass_password.js - Force check_password to always return 1
console.log("[*] Bypassing password check...");

Interceptor.attach(Module.getGlobalExportByName("check_password"), {
    onEnter: function(args) {
        console.log("[*] check_password called with:", args[0].readUtf8String());
    },
    onLeave: function(retval) {
        console.log("[*] Original return value:", retval.toInt32());
        retval.replace(ptr(1));  // Force return 1 (success!)
        console.log("[*] Replaced with: 1");
    }
});
```

### Step 2: Run it

```bash
frida -f ./exercises/bin/ex01_password_check --no-pause -l ex04_bypass_password.js
```

Enter ANY password. It should say "Access granted!" every time!

### The "Aha" Moment

We didn't need to know the password. We didn't even need to reverse engineer the
comparison logic. We just forced the check function to return "true".

This is the power of dynamic instrumentation.

## Part B: Bypass the license checker

The ex04_license_check binary has a more complex validation. Let's bypass it.

### Step 1: First, observe with ltrace

```bash
ltrace ./exercises/bin/ex04_license_check
```

Enter "AAAA-BBBB-CCCC-DDDD" and observe the validation steps.

### Step 2: Bypass validate_license

```javascript
// ex04_bypass_license.js
console.log("[*] License bypass loaded");

// Method 1: Replace return value
Interceptor.attach(Module.getGlobalExportByName("validate_license"), {
    onEnter(args) {
        console.log("[*] validate_license called with:", args[0].readUtf8String());
    },
    onLeave(retval) {
        console.log("[*] Original result:", retval.toInt32());
        retval.replace(ptr(1));
        console.log("[*] Forced to: 1 (valid!)");
    }
});

// Bonus: Also make ourselves admin
Interceptor.attach(Module.getGlobalExportByName("is_admin"), {
    onLeave(retval) {
        retval.replace(ptr(1));
        console.log("[*] is_admin forced to 1");
    }
});
```

### Step 3: Run it

```bash
frida -f ./exercises/bin/ex04_license_check --no-pause -l ex04_bypass_license.js
```

Enter any license key. You should see "License activated!" and admin features.

### Step 4: Alternative - Replace the entire function

```javascript
// Method 2: Replace the entire function
Interceptor.replace(
    Module.getGlobalExportByName("is_admin"),
    new NativeCallback(function() {
        console.log("[*] is_admin called, returning 1");
        return 1;
    }, 'int', [])
);
```

**Question:** What's the difference between `retval.replace()` and `Interceptor.replace()`?

## Challenge: Bypass strcmp directly

Instead of hooking check_password, hook `strcmp` itself to always return 0 (match):

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onLeave(retval) {
        retval.replace(0);  // 0 = strings are equal
    }
});
```

**Warning:** This affects ALL strcmp calls in the process! Can you make it selective?

```javascript
Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        this.isPasswordCheck = args[1].readUtf8String().includes("s3cr3t");
    },
    onLeave(retval) {
        if (this.isPasswordCheck) {
            retval.replace(0);
        }
    }
});
```

## What You Learned

- `retval.replace(ptr(N))` changes a function's return value
- `Interceptor.replace()` swaps out an entire function
- `NativeCallback` creates a JavaScript function callable from native code
- You can bypass authentication without understanding the algorithm
- Selective hooking prevents unwanted side effects
