module app;

void main()
{
    import std.stdio : writeln;
    int unused = 1; // expect an unused variable warning (if enabled); otherwise we can switch to an error
    writeln("hello d");
}
