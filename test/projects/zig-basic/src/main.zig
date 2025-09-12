const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello from zig-basic\n", .{});

    // Deliberate parse error for deterministic diagnostics
    this is not zig
}
