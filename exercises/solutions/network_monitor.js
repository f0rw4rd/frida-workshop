/*
 * network_monitor.js - Solution for ex02_network_beacon exercise
 *
 * This script monitors network activity by hooking:
 *   - connect()  to see where the program connects (IP + port)
 *   - send()     to see what data is sent over the network
 *   - getenv()   to see environment variable lookups (e.g., proxy config)
 *
 * It parses the raw sockaddr_in structure to extract human-readable
 * IP addresses and port numbers.
 *
 * Usage:
 *   1. Compile the target:  gcc -o ex02_network_beacon ex02_network_beacon.c
 *   2. Run with Frida:      frida -l network_monitor.js -f ./ex02_network_beacon
 *
 * What you will learn:
 *   - How to parse binary structures (sockaddr_in) in Frida
 *   - How to monitor network connections and data
 *   - How to read raw memory and convert between data formats
 *   - Practical network traffic analysis with Frida
 */

"use strict";

// ============================================================================
// Background: The sockaddr_in structure
// ============================================================================
//
// When a program calls connect(), it passes a sockaddr_in struct:
//
//   struct sockaddr_in {
//       sa_family_t    sin_family;  // AF_INET = 2 (2 bytes)
//       in_port_t      sin_port;    // Port in network byte order (2 bytes, big-endian)
//       struct in_addr sin_addr;    // IPv4 address (4 bytes, big-endian)
//       char           sin_zero[8]; // Padding (8 bytes)
//   };
//
// Total size: 16 bytes
//
// Key detail: sin_port and sin_addr are in NETWORK byte order (big-endian),
// but x86/x64 CPUs are little-endian. We must handle the byte swap.
// ============================================================================


// ============================================================================
// Helper: Parse a sockaddr_in structure from a pointer
// ============================================================================

function parseSockaddrIn(ptr) {
    // Read sa_family (first 2 bytes) - tells us if this is IPv4, IPv6, etc.
    var family = ptr.readU16();

    if (family !== 2) {
        // AF_INET = 2 (IPv4). Other values:
        //   0  = AF_UNSPEC
        //   1  = AF_LOCAL/AF_UNIX
        //   10 = AF_INET6
        //   16 = AF_NETLINK
        return {
            family: family,
            description: "Non-IPv4 (family=" + family + ")"
        };
    }

    // Read sin_port (bytes 2-3) - stored in big-endian (network byte order)
    // We read 2 bytes and convert from big-endian to host byte order.
    var portRaw = ptr.add(2).readU16();
    // The readU16() reads in host byte order (little-endian on x86).
    // But the port is stored in big-endian, so we need to swap bytes.
    var port = ((portRaw & 0xFF) << 8) | ((portRaw >> 8) & 0xFF);

    // Read sin_addr (bytes 4-7) - four bytes representing the IPv4 address.
    // Each byte is one octet of the IP address.
    var b0 = ptr.add(4).readU8();
    var b1 = ptr.add(5).readU8();
    var b2 = ptr.add(6).readU8();
    var b3 = ptr.add(7).readU8();
    var ip = b0 + "." + b1 + "." + b2 + "." + b3;

    return {
        family: family,
        port: port,
        ip: ip,
        description: ip + ":" + port
    };
}


// ============================================================================
// Helper: Convert a buffer to a hex dump string
// ============================================================================

function hexdump(ptr, length) {
    var result = "";
    var ascii = "";
    var limit = Math.min(length, 256); // Cap at 256 bytes to avoid spam

    for (var i = 0; i < limit; i++) {
        var byte = ptr.add(i).readU8();
        result += ("0" + byte.toString(16)).slice(-2) + " ";
        ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";

        // Add a newline every 16 bytes for readability
        if ((i + 1) % 16 === 0) {
            result += " |" + ascii + "|\n           ";
            ascii = "";
        }
    }

    // Handle the last partial line
    if (ascii.length > 0) {
        // Pad the hex part to align the ASCII column
        var padding = (16 - ascii.length) * 3;
        for (var j = 0; j < padding; j++) {
            result += " ";
        }
        result += " |" + ascii + "|";
    }

    if (length > 256) {
        result += "\n           ... (" + (length - 256) + " more bytes)";
    }

    return result;
}


// ============================================================================
// HOOK 1: connect() - Monitor outbound connections
// ============================================================================
// int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen)
//
// This is called when the program initiates a TCP or UDP connection.

var connectAddr = Module.getGlobalExportByName("connect");

if (connectAddr) {
    console.log("[*] Hooking connect at: " + connectAddr);

    Interceptor.attach(connectAddr, {
        onEnter: function (args) {
            // args[0] = int sockfd          (socket file descriptor)
            // args[1] = struct sockaddr*     (destination address)
            // args[2] = socklen_t addrlen    (size of the sockaddr struct)
            this.sockfd = args[0].toInt32();
            this.addrlen = args[2].toInt32();

            var info = parseSockaddrIn(args[1]);

            console.log("[connect] Socket fd=" + this.sockfd +
                        " -> " + info.description +
                        " (addrlen=" + this.addrlen + ")");

            if (info.ip) {
                // Save connection info for correlation with send() calls
                this.destIp = info.ip;
                this.destPort = info.port;

                // Flag suspicious destinations
                if (info.ip === "0.0.0.0" || info.ip === "127.0.0.1") {
                    console.log("[connect] Note: connecting to localhost");
                }
            }
        },

        onLeave: function (retval) {
            var result = retval.toInt32();
            if (result === 0) {
                console.log("[connect] Success (fd=" + this.sockfd + ")");
            } else if (result === -1) {
                console.log("[connect] FAILED (fd=" + this.sockfd + ")");
            }
        }
    });
} else {
    console.log("[!] Could not find connect");
}


// ============================================================================
// HOOK 2: send() - Monitor outbound data
// ============================================================================
// ssize_t send(int sockfd, const void *buf, size_t len, int flags)
//
// Captures the actual data being sent over the network.

var sendAddr = Module.getGlobalExportByName("send");

if (sendAddr) {
    console.log("[*] Hooking send at: " + sendAddr);

    Interceptor.attach(sendAddr, {
        onEnter: function (args) {
            // args[0] = int sockfd
            // args[1] = const void *buf  (data to send)
            // args[2] = size_t len       (data length)
            // args[3] = int flags
            var sockfd = args[0].toInt32();
            var buf = args[1];
            var len = args[2].toInt32();
            var flags = args[3].toInt32();

            console.log("[send] fd=" + sockfd + " len=" + len + " flags=" + flags);

            // Try to display as UTF-8 text first
            try {
                var data = buf.readUtf8String(len);
                if (data && /^[\x20-\x7E\n\r\t]+$/.test(data)) {
                    console.log("[send] Data (text): \"" + data + "\"");
                } else {
                    console.log("[send] Data (hex): " + hexdump(buf, len));
                }
            } catch (e) {
                console.log("[send] Data (hex): " + hexdump(buf, len));
            }
        },

        onLeave: function (retval) {
            var bytesSent = retval.toInt32();
            if (bytesSent === -1) {
                console.log("[send] FAILED");
            } else {
                console.log("[send] Sent " + bytesSent + " bytes");
            }
        }
    });
} else {
    console.log("[!] Could not find send");
}


// Also hook write() since some programs use write() on sockets instead of send()
var writeAddr = Module.getGlobalExportByName("write");

if (writeAddr) {
    console.log("[*] Hooking write at: " + writeAddr);

    Interceptor.attach(writeAddr, {
        onEnter: function (args) {
            var fd = args[0].toInt32();
            var buf = args[1];
            var count = args[2].toInt32();

            // File descriptors 0, 1, 2 are stdin, stdout, stderr.
            // Socket fds are typically >= 3. Only log those to reduce noise.
            if (fd > 2) {
                console.log("[write] fd=" + fd + " len=" + count);
                try {
                    var data = buf.readUtf8String(Math.min(count, 256));
                    if (data && /^[\x20-\x7E\n\r\t]+$/.test(data)) {
                        console.log("[write] Data: \"" + data + "\"");
                    }
                } catch (e) {
                    // Binary data on a socket
                }
            }
        }
    });
}


// ============================================================================
// HOOK 3: recv() - Monitor inbound data
// ============================================================================
// ssize_t recv(int sockfd, void *buf, size_t len, int flags)

var recvAddr = Module.getGlobalExportByName("recv");

if (recvAddr) {
    console.log("[*] Hooking recv at: " + recvAddr);

    Interceptor.attach(recvAddr, {
        onEnter: function (args) {
            this.sockfd = args[0].toInt32();
            this.buf = args[1];
            this.len = args[2].toInt32();
        },
        onLeave: function (retval) {
            var bytesReceived = retval.toInt32();
            if (bytesReceived > 0) {
                console.log("[recv] fd=" + this.sockfd + " received " + bytesReceived + " bytes");
                try {
                    var data = this.buf.readUtf8String(bytesReceived);
                    if (data && /^[\x20-\x7E\n\r\t]+$/.test(data)) {
                        console.log("[recv] Data: \"" + data + "\"");
                    } else {
                        console.log("[recv] Data (hex): " + hexdump(this.buf, bytesReceived));
                    }
                } catch (e) {
                    console.log("[recv] Data (hex): " + hexdump(this.buf, bytesReceived));
                }
            }
        }
    });
}


// ============================================================================
// HOOK 4: getenv() - Monitor environment variable lookups
// ============================================================================
// char *getenv(const char *name)
//
// Programs often check environment variables for configuration, proxy
// settings, or C2 server addresses. This reveals what the program looks for.

var getenvAddr = Module.getGlobalExportByName("getenv");

if (getenvAddr) {
    console.log("[*] Hooking getenv at: " + getenvAddr);

    Interceptor.attach(getenvAddr, {
        onEnter: function (args) {
            // args[0] = const char *name (environment variable name)
            this.varName = args[0].readUtf8String();
            console.log("[getenv] Looking up: \"" + this.varName + "\"");
        },

        onLeave: function (retval) {
            // retval is NULL if the variable is not set, otherwise a string pointer
            if (retval.isNull()) {
                console.log("[getenv] \"" + this.varName + "\" = (not set)");
            } else {
                var value = retval.readUtf8String();
                console.log("[getenv] \"" + this.varName + "\" = \"" + value + "\"");
            }
        }
    });
} else {
    console.log("[!] Could not find getenv");
}


// ============================================================================
// HOOK 5: socket() - Monitor socket creation
// ============================================================================
// int socket(int domain, int type, int protocol)
//
// Tells us when new sockets are created and what kind (TCP, UDP, raw).

var socketAddr = Module.getGlobalExportByName("socket");

if (socketAddr) {
    console.log("[*] Hooking socket at: " + socketAddr);

    var domainNames = {
        0: "AF_UNSPEC",
        1: "AF_UNIX",
        2: "AF_INET",
        10: "AF_INET6",
        16: "AF_NETLINK",
        17: "AF_PACKET"
    };

    var typeNames = {
        1: "SOCK_STREAM (TCP)",
        2: "SOCK_DGRAM (UDP)",
        3: "SOCK_RAW"
    };

    Interceptor.attach(socketAddr, {
        onEnter: function (args) {
            var domain = args[0].toInt32();
            var type = args[1].toInt32() & 0xFF; // Mask out SOCK_NONBLOCK etc.
            var protocol = args[2].toInt32();

            var domainStr = domainNames[domain] || ("UNKNOWN(" + domain + ")");
            var typeStr = typeNames[type] || ("UNKNOWN(" + type + ")");

            console.log("[socket] Creating: " + domainStr + " / " + typeStr +
                        " protocol=" + protocol);
        },
        onLeave: function (retval) {
            console.log("[socket] Created fd=" + retval.toInt32());
        }
    });
}


// ============================================================================
// HOOK 6: DNS resolution - gethostbyname / getaddrinfo
// ============================================================================

var gethostbynameAddr = Module.getGlobalExportByName("gethostbyname");
if (gethostbynameAddr) {
    console.log("[*] Hooking gethostbyname at: " + gethostbynameAddr);

    Interceptor.attach(gethostbynameAddr, {
        onEnter: function (args) {
            var hostname = args[0].readUtf8String();
            console.log("[gethostbyname] Resolving: \"" + hostname + "\"");
        }
    });
}

var getaddrinfoAddr = Module.getGlobalExportByName("getaddrinfo");
if (getaddrinfoAddr) {
    console.log("[*] Hooking getaddrinfo at: " + getaddrinfoAddr);

    Interceptor.attach(getaddrinfoAddr, {
        onEnter: function (args) {
            try {
                var node = args[0].isNull() ? "(null)" : args[0].readUtf8String();
                var service = args[1].isNull() ? "(null)" : args[1].readUtf8String();
                console.log("[getaddrinfo] Resolving: node=\"" + node +
                            "\" service=\"" + service + "\"");
            } catch (e) {
                console.log("[getaddrinfo] Called (could not read args)");
            }
        }
    });
}


console.log("");
console.log("=== network_monitor.js loaded ===");
console.log("  socket()        -> tracks socket creation");
console.log("  connect()       -> shows destination IP:port (parses sockaddr_in)");
console.log("  send()/write()  -> shows outbound data");
console.log("  recv()          -> shows inbound data");
console.log("  getenv()        -> shows environment variable lookups");
console.log("  DNS functions   -> shows hostname resolution");
console.log("");
console.log("Run the target and observe its network behavior.");
