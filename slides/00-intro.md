# Dynamic Instrumentation with Frida
## A Hands-On Workshop

**FHLUG - FH Oberosterreich Linux User Group**

---

## Get the Code

![Repo QR code](assets/repo-qr.png)

**github.com/f0rw4rd/frida-workshop**

```bash
git clone https://github.com/f0rw4rd/frida-workshop.git
cd frida-workshop && ./setup.sh
```

Clone now so the setup can run in the background while we start.

---

## About This Workshop

- **Duration:** ~2 hours, hands-on
- **Platform:** Linux x86 / x86_64
- **Format:** Short theory blocks followed by practical exercises
- **Goal:** Walk out able to use Frida to hook and modify running programs

> Bring your laptop, follow along, break things.

---

## About Me

**Felix Eberstaller** - OT Pentester & Security Researcher

- FH OOe Hagenberg alumni - Sichere Informationssysteme (Secure Information Systems)
- 30+ CVEs in ICS/SCADA systems (Siemens, Valmet, Schneider, KNX, Checkmk)
- Speaker at Black Hat USA 2025, S4x22, IKT Sicherheitskonferenz
- Contributor to OWASP OT Top 10, Nmap ICS scripts
- Tools: tls-preloader (94 stars), sthenos-embedded-toolkit, knxunlocker

**Blog:** https://f0rw4rd.github.io | **GitHub:** github.com/f0rw4rd | **X:** @f0rw4rd_at

---

## What You'll Learn

1. **Reverse engineering fundamentals** -what it is, why it matters
2. **Static vs dynamic analysis** -when to reach for each
3. **Linux tracing tools** -`strace`, `ltrace`, and friends
4. **Frida** -the Swiss Army knife of dynamic instrumentation
5. **Frida scripting** -writing JavaScript hooks to intercept and modify behavior

---

## Prerequisites

- Comfortable with the **Linux command line** (bash, pipes, basic navigation)
- **Basic C knowledge** -you can read a simple C program
- A laptop running **Linux** (native, VM, or WSL2)
- Python 3 and pip installed
- A terminal you enjoy working in

```bash
# Quick check -you should be able to run:
gcc --version
python3 --version
pip3 --version
```

---

## Quick Poll

Raise your hand if you have used:

- **gdb** -the GNU debugger?
- **strace** -system call tracer?
- **ltrace** -library call tracer?
- **objdump / readelf** -ELF inspection tools?
- **Ghidra** -NSA's reverse engineering suite?
- **Frida** -dynamic instrumentation toolkit?
- **radare2 / Binary Ninja / IDA** -other RE tools?

> No wrong answers. We start from the ground up.

---

## Setup Check

Make sure you can run these before we dive in:

```bash
# Compiler and tools
gcc --version
readelf --version
objdump --version
strace --version
ltrace --version

# Python + Frida (we'll install Frida together later)
python3 -c "print('Python OK')"
pip3 --version
```

If anything is missing:

```bash
# Debian/Ubuntu
sudo apt install build-essential binutils strace ltrace python3-pip

# Arch/Manjaro
sudo pacman -S base-devel binutils strace ltrace python-pip

# Fedora
sudo dnf install gcc binutils strace ltrace python3-pip
```

---

## Let's Get Started

> "You can't trust code that you did not totally create yourself."
> - Ken Thompson, "Reflections on Trusting Trust" (1984 Turing Award Lecture)

Next up: **Reverse Engineering Basics**
