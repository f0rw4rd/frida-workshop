/*
 * file_reader.c - Frida Course Exercise 4 (strace / ltrace focus)
 *
 * A config file reader that tries multiple file paths before giving up.
 * If a config file is found, it checks whether the first line starts with
 * "PREMIUM" to decide which feature set to enable.
 *
 * Build:
 *   gcc -o file_reader file_reader.c
 *
 * Exercise goals:
 *   - Use strace to observe which files the program tries to open
 *     (you will see open/openat calls for each path with ENOENT errors)
 *   - Use ltrace to see the fopen(), fgets(), and strncmp() calls
 *   - Create a config file at one of the paths with "PREMIUM" as the
 *     first line to unlock premium features
 *   - Use Frida to hook strncmp() or fgets() to fake premium status
 *
 * Config search order:
 *   1. /etc/myapp/config.dat
 *   2. ./config.dat
 *   3. /tmp/config.dat
 */

#include <stdio.h>
#include <string.h>

#define MAX_LINE 256

static const char *config_paths[] = {
    "/etc/myapp/config.dat",
    "./config.dat",
    "/tmp/config.dat",
    NULL
};

int main(void)
{
    FILE *fp = NULL;
    char line[MAX_LINE];
    const char **path;

    printf("Looking for configuration file...\n");

    /* Try each config path in order */
    for (path = config_paths; *path != NULL; path++) {
        printf("  Trying: %s\n", *path);
        fp = fopen(*path, "r");
        if (fp != NULL) {
            printf("  Found: %s\n", *path);
            break;
        }
    }

    if (fp == NULL) {
        fprintf(stderr, "Error: No configuration file found.\n");
        fprintf(stderr, "Create one at /tmp/config.dat and try again.\n");
        return 1;
    }

    /* Read the first line */
    if (fgets(line, sizeof(line), fp) == NULL) {
        fprintf(stderr, "Error: Could not read configuration file.\n");
        fclose(fp);
        return 1;
    }

    fclose(fp);

    /* Strip trailing newline */
    size_t len = strlen(line);
    if (len > 0 && line[len - 1] == '\n') {
        line[len - 1] = '\0';
    }

    /* Check for premium status */
    if (strncmp(line, "PREMIUM", 7) == 0) {
        printf("Premium features unlocked!\n");
    } else {
        printf("Running in free mode.\n");
    }

    return 0;
}
