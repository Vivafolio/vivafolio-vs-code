module app;

// Force an error that should surface as a diagnostic including the vivafolio payload
static assert(0, "vivafolio: {\"viewstate\": {\"value\": 99}, \"height\": 90}");

void main()
{
    import std.stdio : writeln;
    writeln("Hello D");
}


