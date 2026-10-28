"""Bring the loopback interface up inside a fresh network namespace.

`unshare -n` creates a namespace whose only interface, lo, is down. The harness needs
127.0.0.1 and ::1 for the CLI <-> daemon IPC, and nothing else. This uses the
SIOCGIFFLAGS/SIOCSIFFLAGS ioctls, so it needs no iproute2. Run it with `python3 -I`.
"""

import fcntl
import socket
import struct
import sys

SIOCGIFFLAGS = 0x8913
SIOCSIFFLAGS = 0x8914
IFF_UP = 0x1


def main() -> int:
    name = (sys.argv[1] if len(sys.argv) > 1 else "lo").encode()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        request = struct.pack("16sH14s", name, 0, b"\0" * 14)
        flags = struct.unpack("16sH14s", fcntl.ioctl(sock, SIOCGIFFLAGS, request))[1]
        if not flags & IFF_UP:
            fcntl.ioctl(sock, SIOCSIFFLAGS, struct.pack("16sH14s", name, flags | IFF_UP, b"\0" * 14))
        flags = struct.unpack("16sH14s", fcntl.ioctl(sock, SIOCGIFFLAGS, request))[1]
    if not flags & IFF_UP:
        print(f"lo_up: {name.decode()} is still down", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
