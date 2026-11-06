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
