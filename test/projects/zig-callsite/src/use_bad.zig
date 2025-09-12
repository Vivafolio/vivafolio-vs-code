const std = @import("std");
const provider = @import("bad_provider.zig");

pub fn main() void {
    const s: []const u8 = "oops";
    const _y = provider.needsInt(s); // type mismatch at call site
}



