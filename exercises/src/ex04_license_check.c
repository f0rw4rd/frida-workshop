/*
 * license_check.c - Frida Course Exercise 2
 *
 * A license key validator with multi-step verification.
 * The valid key is "FR1D-4R0C-KS42-LUG!" (format: XXXX-XXXX-XXXX-XXXX).
 *
 * Build:
 *   gcc -o license_check license_check.c
 *
 * Exercise goals:
 *   - Use ltrace to observe string operations and function calls
 *   - Use Frida to hook validate_license() and force it to return 1
 *   - Use Frida to hook is_admin() and force it to return 1
 *   - Use Frida to trace each validation step and understand the logic
 *
 * Validation steps:
 *   1. Key length must be exactly 19 characters
 *   2. Dashes must appear at positions 4, 9, and 14
 *   3. XOR of the ASCII values of the first group ("FR1D") must equal
 *      a magic value (0x61). This is a simple integrity check.
 */

#include <stdio.h>
#include <string.h>

/* The actual valid license key */
#define VALID_KEY "FR1D-4R0C-KS42-LUG!"

/* Magic XOR value for the first group: 'F' ^ 'R' ^ '1' ^ 'D' = 0x61 */
#define MAGIC_XOR 0x61

/*
 * is_admin() - Always returns 0.
 *
 * Students can hook this with Frida to return 1 and unlock
 * the "admin" code path.
 */
int is_admin(void)
{
    return 0;
}

/*
 * validate_license() - Multi-step license key validation.
 *
 * Returns 1 if the key is valid, 0 otherwise.
 */
int validate_license(const char *key)
{
    /* Step 1: Check length (XXXX-XXXX-XXXX-XXXX = 19 characters) */
    if (strlen(key) != 19) {
        return 0;
    }

    /* Step 2: Check dash positions */
    if (key[4] != '-' || key[9] != '-' || key[14] != '-') {
        return 0;
    }

    /* Step 3: XOR check on the first group */
    unsigned char xor_result = 0;
    for (int i = 0; i < 4; i++) {
        xor_result ^= (unsigned char)key[i];
    }
    if (xor_result != MAGIC_XOR) {
        return 0;
    }

    /* Step 4: Full key comparison */
    if (strcmp(key, VALID_KEY) != 0) {
        return 0;
    }

    return 1;
}

int main(void)
{
    char buffer[256];

    printf("Enter license key: ");
    fflush(stdout);

    if (fgets(buffer, sizeof(buffer), stdin) == NULL) {
        fprintf(stderr, "Error reading input.\n");
        return 1;
    }

    /* Strip trailing newline */
    size_t len = strlen(buffer);
    if (len > 0 && buffer[len - 1] == '\n') {
        buffer[len - 1] = '\0';
    }

    if (validate_license(buffer)) {
        printf("License activated!\n");

        if (is_admin()) {
            printf("Admin mode enabled. Full access granted.\n");
        } else {
            printf("Standard user mode.\n");
        }
    } else {
        printf("Invalid license key.\n");
    }

    return 0;
}
