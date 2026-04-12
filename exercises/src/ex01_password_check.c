/*
 * password_check.c - Frida Course Exercise 1
 *
 * A simple password checker. The password is hardcoded and compared
 * using strcmp(), making it trivially visible with ltrace or Frida.
 *
 * Build:
 *   gcc -o password_check password_check.c
 *
 * Exercise goals:
 *   - Use ltrace to see the strcmp() call and leak the password
 *   - Use Frida to hook check_password() and force it to return 1
 *   - Use Frida to hook strcmp() and log its arguments
 */

#include <stdio.h>
#include <string.h>

#define SECRET_PASSWORD "sup3r_s3cr3t_p4ss"

int check_password(const char *input)
{
    if (strcmp(input, SECRET_PASSWORD) == 0) {
        return 1;
    }
    return 0;
}

int main(void)
{
    char buffer[256];

    printf("Enter password: ");
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

    if (check_password(buffer)) {
        printf("Access granted!\n");
    } else {
        printf("Access denied.\n");
    }

    return 0;
}
