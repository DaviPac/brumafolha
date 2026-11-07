# Brumafolha in C. Needs SDL2 and SDL2_ttf (Debian/Ubuntu: apt install libsdl2-dev libsdl2-ttf-dev).
CC ?= cc
CFLAGS ?= -O2 -g -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers -Wno-misleading-indentation -Wno-unused-function
override CFLAGS += -std=c11 -D_DEFAULT_SOURCE $(shell pkg-config --cflags sdl2 SDL2_ttf)
override LDLIBS += $(shell pkg-config --libs sdl2 SDL2_ttf) -lm -lpthread

SRC := $(wildcard src/*.c)
OBJ := $(SRC:src/%.c=build/%.o)

brumafolha: $(OBJ)
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

build/%.o: src/%.c src/game.h src/pfx.h src/ui.h src/text.h | build
	$(CC) $(CFLAGS) -c -o $@ $<

build:
	mkdir -p build

clean:
	rm -rf build brumafolha

.PHONY: clean

# A tarball to run on other Linux x86-64 machines (glibc 2.35+, e.g. Ubuntu/Pop!_OS 22.04 and newer).
dist: clean
	$(MAKE) CFLAGS="-O2 -include src/glibc_compat.h -Wall -Wno-unused-parameter -Wno-unused-function -Wno-misleading-indentation -Wno-format-truncation"
	rm -rf dist/brumafolha && mkdir -p dist/brumafolha/lib
	cp brumafolha brumafolha.sh README.md dist/brumafolha/
	strip dist/brumafolha/brumafolha
	cp -r assets dist/brumafolha/
	cp -L $$(ldconfig -p | awk '/libSDL2_ttf-2.0.so.0 .*x86-64/ {print $$NF; exit}') dist/brumafolha/lib/libSDL2_ttf-2.0.so.0
	tar -C dist -czf dist/brumafolha-linux-x86_64.tar.gz brumafolha

.PHONY: dist
