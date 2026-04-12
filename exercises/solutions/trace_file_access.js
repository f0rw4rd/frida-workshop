/*
 * trace_file_access.js - Solution for ex02_file_reader exercise
 *
 * This script traces all file operations to understand what a program
 * reads and how it processes file data. It hooks:
 *   - fopen()   to see which files are opened
 *   - fgets()   to see what data is read line by line
 *   - strcmp()   to see string comparisons (e.g., parsing config files)
 *   - strncmp() to see partial string comparisons
 *
 * Usage:
 *   1. Compile the target:  gcc -o ex02_file_reader ex02_file_reader.c
 *   2. Run with Frida:      frida -l trace_file_access.js -f ./ex02_file_reader
 *
 * What you will learn:
 *   - How to trace file I/O at the libc level
 *   - How to use Frida to understand unknown file formats
 *   - How to correlate file reads with string comparisons
 *   - Practical reverse engineering of file parsing logic
 */

"use strict";

// ============================================================================
// HOOK 1: fopen() - Track which files the program opens
// ============================================================================
// fopen(const char *pathname, const char *mode) -> FILE*
//
// This is the first thing to hook when RE-ing file handling. It tells you
// exactly which files the program accesses and in what mode (read/write).

var fopenAddr = Module.getGlobalExportByName("fopen");

if (fopenAddr) {
    console.log("[*] Hooking fopen at: " + fopenAddr);

    Interceptor.attach(fopenAddr, {
        onEnter: function (args) {
            // args[0] = const char *pathname (file path being opened)
            // args[1] = const char *mode     ("r", "w", "rb", "a", etc.)
            this.pathname = args[0].readUtf8String();
            this.mode = args[1].readUtf8String();

            console.log("[fopen] Opening: \"" + this.pathname + "\" mode: \"" + this.mode + "\"");
        },

        onLeave: function (retval) {
            // retval is the FILE* pointer. NULL means the open failed.
            if (retval.isNull()) {
                console.log("[fopen] FAILED to open: \"" + this.pathname + "\"");
            } else {
                // Store the FILE* so we can correlate it with later fgets calls
                console.log("[fopen] Success: \"" + this.pathname +
                            "\" -> FILE* = " + retval);
            }
        }
    });
} else {
    console.log("[!] Could not find fopen");
}


// Also hook fopen64 which is common on 64-bit Linux
var fopen64Addr = Module.getGlobalExportByName("fopen64");
if (fopen64Addr && !fopen64Addr.equals(fopenAddr)) {
    console.log("[*] Also hooking fopen64 at: " + fopen64Addr);

    Interceptor.attach(fopen64Addr, {
        onEnter: function (args) {
            this.pathname = args[0].readUtf8String();
            this.mode = args[1].readUtf8String();
            console.log("[fopen64] Opening: \"" + this.pathname + "\" mode: \"" + this.mode + "\"");
        },
        onLeave: function (retval) {
            if (retval.isNull()) {
                console.log("[fopen64] FAILED: \"" + this.pathname + "\"");
            } else {
                console.log("[fopen64] Success: \"" + this.pathname + "\" -> " + retval);
            }
        }
    });
}


// ============================================================================
// HOOK 2: fgets() - Track what data is read from files
// ============================================================================
// char *fgets(char *s, int size, FILE *stream) -> char* (or NULL on EOF)
//
// fgets reads one line at a time (up to size-1 chars). By hooking onLeave,
// we can read the buffer AFTER fgets fills it, revealing file contents.

var fgetsAddr = Module.getGlobalExportByName("fgets");

if (fgetsAddr) {
    console.log("[*] Hooking fgets at: " + fgetsAddr);

    Interceptor.attach(fgetsAddr, {
        onEnter: function (args) {
            // Save the buffer pointer so we can read it in onLeave
            // args[0] = char *s       (output buffer)
            // args[1] = int size      (buffer size)
            // args[2] = FILE *stream  (file being read)
            this.buffer = args[0];
            this.size = args[1].toInt32();
        },

        onLeave: function (retval) {
            // retval is NULL on EOF or error, otherwise same as buffer
            if (!retval.isNull()) {
                // Read the data that fgets placed into the buffer
                try {
                    var data = this.buffer.readUtf8String();
                    // Trim trailing newline for cleaner output
                    if (data) {
                        data = data.replace(/\n$/, "");
                        console.log("[fgets] Read: \"" + data + "\"");
                    }
                } catch (e) {
                    // If readUtf8String fails, the data may be binary
                    console.log("[fgets] Read " + this.size + " bytes (binary data)");
                }
            } else {
                console.log("[fgets] Returned NULL (EOF or error)");
            }
        }
    });
} else {
    console.log("[!] Could not find fgets");
}


// ============================================================================
// HOOK 3: fread() - Track binary file reads
// ============================================================================
// size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream)
//
// fread is used for binary data. Hooking it reveals raw data reads.

var freadAddr = Module.getGlobalExportByName("fread");

if (freadAddr) {
    console.log("[*] Hooking fread at: " + freadAddr);

    Interceptor.attach(freadAddr, {
        onEnter: function (args) {
            this.ptr = args[0];
            this.size = args[1].toInt32();
            this.nmemb = args[2].toInt32();
        },
        onLeave: function (retval) {
            var itemsRead = retval.toInt32();
            var bytesRead = itemsRead * this.size;
            if (bytesRead > 0) {
                console.log("[fread] Read " + bytesRead + " bytes (" +
                            itemsRead + " items of size " + this.size + ")");

                // Try to display as string if it looks like text
                try {
                    var preview = this.ptr.readUtf8String(Math.min(bytesRead, 80));
                    if (preview && /^[\x20-\x7E\n\r\t]+$/.test(preview)) {
                        console.log("[fread] Preview: \"" + preview.replace(/\n/g, "\\n") + "\"");
                    }
                } catch (e) {
                    // Binary data - show hex dump of first few bytes
                    var hex = "";
                    var limit = Math.min(bytesRead, 32);
                    for (var i = 0; i < limit; i++) {
                        var byte = this.ptr.add(i).readU8();
                        hex += ("0" + byte.toString(16)).slice(-2) + " ";
                    }
                    console.log("[fread] Hex: " + hex);
                }
            }
        }
    });
}


// ============================================================================
// HOOK 4: strcmp() and strncmp() - Track string comparisons
// ============================================================================
// These reveal how the program processes file data. For example, parsing a
// config file often involves comparing keys: strcmp(key, "username")

var strcmpAddr = Module.getGlobalExportByName("strcmp");

if (strcmpAddr) {
    console.log("[*] Hooking strcmp at: " + strcmpAddr);

    Interceptor.attach(strcmpAddr, {
        onEnter: function (args) {
            try {
                var s1 = args[0].readUtf8String();
                var s2 = args[1].readUtf8String();

                // Filter out noise: only log non-empty, printable comparisons
                if (s1 && s2 && s1.length > 0 && s2.length > 0 &&
                    s1.length < 256 && s2.length < 256) {
                    console.log("[strcmp] \"" + s1 + "\" vs \"" + s2 + "\"");
                }
            } catch (e) {
                // Ignore read errors (some pointers may be invalid)
            }
        },
        onLeave: function (retval) {
            // strcmp returns: 0 if equal, <0 if s1<s2, >0 if s1>s2
            // We could log this too, but it gets noisy.
        }
    });
}


var strncmpAddr = Module.getGlobalExportByName("strncmp");

if (strncmpAddr) {
    console.log("[*] Hooking strncmp at: " + strncmpAddr);

    Interceptor.attach(strncmpAddr, {
        onEnter: function (args) {
            try {
                var s1 = args[0].readUtf8String();
                var s2 = args[1].readUtf8String();
                var n = args[2].toInt32();

                if (s1 && s2 && s1.length > 0 && s2.length > 0) {
                    console.log("[strncmp] \"" + s1.substring(0, n) +
                                "\" vs \"" + s2.substring(0, n) +
                                "\" (n=" + n + ")");
                }
            } catch (e) {
                // Ignore
            }
        }
    });
}


// ============================================================================
// HOOK 5: fclose() - Track when files are closed
// ============================================================================

var fcloseAddr = Module.getGlobalExportByName("fclose");

if (fcloseAddr) {
    console.log("[*] Hooking fclose at: " + fcloseAddr);

    Interceptor.attach(fcloseAddr, {
        onEnter: function (args) {
            console.log("[fclose] Closing FILE* = " + args[0]);
        }
    });
}


console.log("");
console.log("=== trace_file_access.js loaded ===");
console.log("  fopen/fopen64 -> shows which files are accessed");
console.log("  fgets/fread   -> shows what data is read");
console.log("  strcmp/strncmp -> shows how data is compared/parsed");
console.log("  fclose        -> shows when files are closed");
console.log("");
console.log("Run the target and observe the file I/O trace.");
