CC = gcc
CFLAGS = -no-pie -g -Wall
SRC_DIR = exercises/src
BIN_DIR = exercises/bin

TARGETS = ex01_password_check ex04_license_check ex05_game_score ex02_file_reader ex02_network_beacon ex06_anti_debug

ALL_BINS = $(addprefix $(BIN_DIR)/,$(TARGETS))

RELEASE_VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
RELEASE_NAME = frida-workshop-$(RELEASE_VERSION)
DIST_DIR = dist

.PHONY: all clean release presentation

all: $(BIN_DIR) $(ALL_BINS)
	@echo ""
	@echo "All exercise binaries built in $(BIN_DIR)/"
	@echo "Run 'make check' to verify they work."

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

$(BIN_DIR)/ex01_password_check: $(SRC_DIR)/ex01_password_check.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

$(BIN_DIR)/ex04_license_check: $(SRC_DIR)/ex04_license_check.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

$(BIN_DIR)/ex05_game_score: $(SRC_DIR)/ex05_game_score.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

$(BIN_DIR)/ex02_file_reader: $(SRC_DIR)/ex02_file_reader.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

$(BIN_DIR)/ex02_network_beacon: $(SRC_DIR)/ex02_network_beacon.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

$(BIN_DIR)/ex06_anti_debug: $(SRC_DIR)/ex06_anti_debug.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

check: all
	@echo "=== Checking binaries ==="
	@for bin in $(ALL_BINS); do \
		echo -n "$$bin: "; \
		file $$bin | grep -o 'ELF.*'; \
	done
	@echo ""
	@echo "=== Symbol check ==="
	@nm $(BIN_DIR)/ex01_password_check | grep -c " T " | xargs -I{} echo "ex01_password_check: {} exported functions"
	@nm $(BIN_DIR)/ex04_license_check | grep -c " T " | xargs -I{} echo "ex04_license_check: {} exported functions"
	@echo ""
	@echo "All checks passed!"

presentation:
	python3 build.py

release: all presentation
	rm -rf $(DIST_DIR)/$(RELEASE_NAME)
	mkdir -p $(DIST_DIR)/$(RELEASE_NAME)
	cp -r exercises $(DIST_DIR)/$(RELEASE_NAME)/
	cp presentation.html README.md setup.sh Makefile $(DIST_DIR)/$(RELEASE_NAME)/
	mkdir -p $(DIST_DIR)/$(RELEASE_NAME)/slides
	cp slides/*.md $(DIST_DIR)/$(RELEASE_NAME)/slides/
	cd $(DIST_DIR) && tar czf $(RELEASE_NAME).tar.gz $(RELEASE_NAME)
	cd $(DIST_DIR) && sha256sum $(RELEASE_NAME).tar.gz > $(RELEASE_NAME).tar.gz.sha256
	@echo ""
	@echo "Release bundle: $(DIST_DIR)/$(RELEASE_NAME).tar.gz"
	@du -h $(DIST_DIR)/$(RELEASE_NAME).tar.gz

clean:
	rm -rf $(BIN_DIR) $(DIST_DIR) presentation.html
	@echo "Cleaned build artifacts."
