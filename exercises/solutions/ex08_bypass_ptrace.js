// ex08: Bypass ptrace-based anti-debug. Forces PTRACE_TRACEME (request=0) to return 0.

Interceptor.attach(Module.getGlobalExportByName("ptrace"), {
    onEnter(args) { this.request = args[0].toInt32(); },
    onLeave(retval) {
        if (this.request === 0) retval.replace(0);
    }
});
