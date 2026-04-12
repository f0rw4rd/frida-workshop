/*
 * anti_debug.c - Frida Course Exercise 6
 *
 * An anti-debugging example that uses ptrace(PTRACE_TRACEME) to detect
 * if a debugger is attached. If no debugger is detected, it computes
 * and prints a secret flag.
 *
 * Build:
 *   gcc -o anti_debug anti_debug.c
 *
 * Exercise goals:
 *   - Observe the anti-debug behavior (running under strace will trigger it!)
 *   - Use Frida to hook ptrace() and force it to return 0
 *   - Use Frida to hook compute_flag() and read the result
 *   - Understand why ptrace(PTRACE_TRACEME) is a common anti-debug trick:
 *     a process can only be traced once, so if ptrace succeeds, no debugger
 *     is attached; if it fails, something is already tracing us.
 *
 * The hidden flag: CTF{n0_debug_n0_pr0blem}
 */

#include <stdio.h>
#include <string.h>
#include <sys/ptrace.h>

/*
 * XOR-encoded flag bytes.
 * Each byte is the flag character XOR'd with 0x42.
 *
 * Flag: "CTF{n0_debug_n0_pr0blem}"
 *
 * Encoding: for each char c in flag, store c ^ 0x42
 */
static const unsigned char encoded_flag[] = {
    0x01, 0x16, 0x04, 0x39, 0x2c, 0x72, 0x1d, 0x26,  /* C T F { n 0 _ d */
    0x27, 0x20, 0x37, 0x25, 0x1d, 0x2c, 0x72, 0x1d,  /* e b u g _ n 0 _ */
    0x32, 0x30, 0x72, 0x20, 0x2e, 0x27, 0x2f, 0x3f   /* p r 0 b l e m } */
};

#define FLAG_LEN (sizeof(encoded_flag))
#define XOR_KEY  0x42

/*
 * compute_flag() - Decodes the XOR-encoded flag into the provided buffer.
 *
 * Students can hook this function with Frida to read the output buffer
 * after it returns, or they can just XOR the encoded bytes themselves.
 */
void compute_flag(char *output, size_t output_size)
{
    size_t len = FLAG_LEN;
    if (len >= output_size) {
        len = output_size - 1;
    }

    for (size_t i = 0; i < len; i++) {
        output[i] = encoded_flag[i] ^ XOR_KEY;
    }
    output[len] = '\0';
}

int main(void)
{
    char flag[64];

    printf("Running security checks...\n");

    /*
     * ptrace(PTRACE_TRACEME) anti-debug check.
     *
     * If a debugger (or strace) is already attached, this call fails
     * and returns -1. If no debugger is present, it succeeds and
     * returns 0.
     */
    if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) {
        printf("Debugger detected! Exiting.\n");
        return 1;
    }

    printf("No debugger detected. Computing secret...\n");

    compute_flag(flag, sizeof(flag));

    printf("Secret flag: %s\n", flag);

    return 0;
}
