// Release builds only (make dist): bind the two libm functions whose newest symbol versions would demand a
// recent glibc (fmod@2.38, hypot@2.35) to their old versions, so the binary also runs on Ubuntu 22.04-based
// systems (Pop!_OS 22.04, glibc 2.35).
#if defined(__linux__) && defined(__x86_64__)
__asm__(".symver fmod,fmod@GLIBC_2.2.5");
__asm__(".symver hypot,hypot@GLIBC_2.2.5");
#endif
