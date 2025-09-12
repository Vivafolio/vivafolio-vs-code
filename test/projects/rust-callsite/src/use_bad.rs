use rust_callsite::needs_int;

fn main() {
    let s = "oops";
    let _y = needs_int(s); // type mismatch at call site
}



