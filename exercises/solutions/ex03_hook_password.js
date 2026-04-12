// ex03: Hook strcmp to reveal the hardcoded password.

Interceptor.attach(Module.getGlobalExportByName("strcmp"), {
    onEnter(args) {
        const s1 = args[0].readUtf8String();
        const s2 = args[1].readUtf8String();
        console.log(`strcmp("${s1}", "${s2}")`);
    }
});
