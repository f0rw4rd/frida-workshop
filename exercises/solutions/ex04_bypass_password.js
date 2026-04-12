// ex04: Force strcmp to report a match, bypassing the password check.

Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onLeave(retval) {
        retval.replace(0);
    }
});
