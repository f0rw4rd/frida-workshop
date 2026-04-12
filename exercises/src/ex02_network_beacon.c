/*
 * network_beacon.c - Frida Course Exercise 5 (strace / ltrace focus)
 *
 * Simulates a network beacon that connects to a server and sends
 * a check-in message. The connection will fail unless something is
 * actually listening on the target port (which is expected).
 *
 * Build:
 *   gcc -o network_beacon network_beacon.c
 *
 * Exercise goals:
 *   - Use strace to observe socket(), connect(), and sendto() syscalls
 *   - strace reveals the IP address and port (127.0.0.1:8443)
 *   - Use ltrace to observe getenv("BEACON_HOST") call
 *   - Use Frida to hook connect() and redirect traffic
 *   - Use Frida to hook getenv() and inject a custom host value
 *
 * Environment variables:
 *   BEACON_HOST - Override the default host (127.0.0.1)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <netinet/in.h>

#define DEFAULT_HOST "127.0.0.1"
#define BEACON_PORT  8443
#define CHECKIN_MSG  "CHECKIN"

int main(void)
{
    const char *host;
    int sockfd;
    struct sockaddr_in server_addr;

    /* Check for host override via environment variable */
    host = getenv("BEACON_HOST");
    if (host == NULL) {
        host = DEFAULT_HOST;
    }

    printf("Beacon target: %s:%d\n", host, BEACON_PORT);

    /* Create a TCP socket */
    sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd < 0) {
        perror("socket");
        return 1;
    }

    /* Set up the server address */
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(BEACON_PORT);

    if (inet_pton(AF_INET, host, &server_addr.sin_addr) <= 0) {
        fprintf(stderr, "Invalid address: %s\n", host);
        close(sockfd);
        return 1;
    }

    /* Attempt to connect */
    printf("Connecting to server...\n");
    if (connect(sockfd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        printf("Server not available.\n");
        close(sockfd);
        return 0;
    }

    /* Send the check-in message */
    printf("Connected! Sending beacon...\n");
    if (send(sockfd, CHECKIN_MSG, strlen(CHECKIN_MSG), 0) < 0) {
        perror("send");
        close(sockfd);
        return 1;
    }

    printf("Beacon sent successfully.\n");

    close(sockfd);
    return 0;
}
