// ex06: Force ptrace(PTRACE_TRACEME) to succeed so the anti-debug check passes.

Interceptor.attach(Module.getGlobalExportByName("ptrace"), {
    onLeave(retval) {
        retval.replace(0);
    }
});
