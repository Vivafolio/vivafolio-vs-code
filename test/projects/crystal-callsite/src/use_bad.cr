require "./bad_provider"

s = "oops"
y = BadProvider.needs_int(s) # type mismatch at call site



