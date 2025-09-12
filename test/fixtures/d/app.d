module app;

// Emit a compile-time message that serve-d could surface as a diagnostic.
// We include a vivafolio payload in the message string.
pragma(msg, "vivafolio: {\"viewstate\": {\"value\": 99}, \"height\": 90}");

void main()
{
    import std.stdio : writeln;
    writeln("Hello D");
}






