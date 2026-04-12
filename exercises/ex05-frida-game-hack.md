# Exercise 5: Game Hacking with Frida

**Duration:** ~10 minutes
**Tools:** frida
**Target:** `exercises/bin/ex05_game_score`

## Objective

The ex05_game_score program runs 5 rounds where each round generates a random score
(0-99). Getting a total of 400+ is essentially impossible. Use Frida to cheat!

## Step 1: Run the game normally

```bash
./exercises/bin/ex05_game_score
```

Your total will typically be around 200-300. Not enough for LEGENDARY status.

## Step 2: Observe with ltrace

```bash
ltrace ./exercises/bin/ex05_game_score
```

You'll see calls to `rand()` and `get_score()`.

## Step 3: Hook get_score to return 100

Create `ex05_game_cheat.js`:

```javascript
// ex05_game_cheat.js - Always get perfect scores
console.log("[*] Game hack loaded!");

// Replace get_score() entirely
Interceptor.replace(
    Module.getGlobalExportByName("get_score"),
    new NativeCallback(function() {
        console.log("[*] get_score called, returning 100!");
        return 100;
    }, 'int', [])
);
```

## Step 4: Run with the cheat

```bash
frida -f ./exercises/bin/ex05_game_score --no-pause -l ex05_game_cheat.js
```

You should see:
```
Round 1: Score = 100
Round 2: Score = 100
...
Total score: 500
LEGENDARY! You win the flag: CTF{frida_master}
```

## Alternative: Hook rand() instead

```javascript
// Hook at a lower level - make rand() return 99
Interceptor.attach(Module.getGlobalExportByName("rand"), {
    onLeave(retval) {
        retval.replace(ptr(99));
    }
});
```

**Question:** Why does this give scores of 99 instead of 100?
**Answer:** Because `get_score` does `rand() % 100`, so 99 % 100 = 99.

## Challenge: Log original AND return modified

```javascript
// Save a reference to the original function
var original_get_score = new NativeFunction(
    Module.getGlobalExportByName("get_score"),
    'int', []
);

Interceptor.replace(
    Module.getGlobalExportByName("get_score"),
    new NativeCallback(function() {
        var real = original_get_score();
        console.log("[*] Real score: " + real + " -> Modified: 100");
        return 100;
    }, 'int', [])
);
```

## What You Learned

- `Interceptor.replace()` + `NativeCallback` = complete function replacement
- `NativeFunction` wraps a native function so JavaScript can call it
- You can combine both to call the original AND return a modified value
- Hooking at different levels (get_score vs rand) produces different effects
