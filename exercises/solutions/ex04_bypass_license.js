// ex04: Bypass validate_license and is_admin by forcing both return values.

const mod = Process.enumerateModules()[0];

Interceptor.attach(mod.getExportByName("validate_license"), {
    onLeave(retval) { retval.replace(1); }
});

Interceptor.replace(
    mod.getExportByName("is_admin"),
    new NativeCallback(() => 1, "int", [])
);
