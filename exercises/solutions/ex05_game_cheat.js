// ex05: Replace get_score with a stub that always returns 100.

const mod = Process.enumerateModules()[0];

Interceptor.replace(
    mod.getExportByName("get_score"),
    new NativeCallback(() => 100, "int", [])
);
