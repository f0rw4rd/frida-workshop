// ex07: Hook a function by module base + offset (no symbols required).
// Find the offset with: objdump -d exercises/bin/ex01_password_check | grep check_password

const mod = Process.enumerateModules()[0];
const checkPassword = mod.base.add(0x1189);  // adjust to your objdump offset

Interceptor.attach(checkPassword, {
    onEnter(args) {
        console.log("check_password input:", args[0].readUtf8String());
    },
    onLeave(retval) {
        retval.replace(ptr(1));
    }
});
