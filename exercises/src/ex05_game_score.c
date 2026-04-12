/*
 * game_score.c - Frida Course Exercise 3
 *
 * A simple score game that runs 5 rounds. Each round generates a
 * random score between 0 and 99. Getting a total >= 400 is nearly
 * impossible without intervention (expected total ~250).
 *
 * Build:
 *   gcc -o game_score game_score.c
 *
 * Exercise goals:
 *   - Use Frida to hook get_score() and return a high value (e.g., 100)
 *   - Use Frida to hook rand() and control the RNG
 *   - Observe the difference between hooking the application function
 *     vs. hooking the libc function
 */

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define NUM_ROUNDS    5
#define LEGENDARY_MIN 400
#define GREAT_MIN     250

/*
 * get_score() - Returns a random score for one round.
 *
 * Students should hook this function with Frida and replace
 * its return value with something >= 80 to reach LEGENDARY.
 */
int get_score(void)
{
    return rand() % 100;
}

int main(void)
{
    int total = 0;
    int score;

    srand(time(NULL));

    printf("=== Score Game ===\n");
    printf("Play %d rounds. Try to reach %d points!\n\n", NUM_ROUNDS, LEGENDARY_MIN);

    for (int round = 1; round <= NUM_ROUNDS; round++) {
        score = get_score();
        total += score;
        printf("Round %d: scored %d points (total: %d)\n", round, score, total);
    }

    printf("\n--- Final Score: %d ---\n", total);

    if (total >= LEGENDARY_MIN) {
        printf("LEGENDARY! You win the flag: CTF{frida_master}\n");
    } else if (total >= GREAT_MIN) {
        printf("Great score!\n");
    } else {
        printf("Better luck next time.\n");
    }

    return 0;
}
